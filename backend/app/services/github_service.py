import asyncio
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from app.core.config import settings

ALLOWED_EXTENSIONS = {
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".go",
    ".java",
    ".rs",
    ".rb",
    ".php",
    ".cs",
    ".cpp",
    ".c",
    ".h",
    ".md",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".sql",
}

EXCLUDED_DIRS = {
    ".git",
    ".github",
    "node_modules",
    "dist",
    "build",
    "venv",
    ".venv",
    "__pycache__",
    ".next",
    ".idea",
    ".vscode",
}

GITHUB_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")
SSH_REPO_PATTERN = re.compile(r"^(?:ssh://)?git@github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?/?$")


@dataclass(slots=True)
class ResolvedGitHubRepo:
    public_url: str
    clone_url: str
    branch: str | None


def detect_language(file_path: str) -> str:
    extension = Path(file_path).suffix.lower()
    mapping = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".go": "go",
        ".java": "java",
        ".rs": "rust",
        ".rb": "ruby",
        ".php": "php",
        ".cs": "csharp",
        ".cpp": "cpp",
        ".c": "c",
        ".h": "c",
        ".md": "markdown",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".toml": "toml",
        ".sql": "sql",
    }
    return mapping.get(extension, "text")


class GitHubService:
    def __init__(self) -> None:
        self.max_file_size_bytes = settings.max_file_size_kb * 1024
        self.github_token = settings.github_token.strip()

    async def resolve_repository(self, repo_input: str, branch: str | None) -> ResolvedGitHubRepo:
        public_url, branch_candidates = self._normalize_repo_input(repo_input)
        clone_url = self._build_clone_url(public_url)

        await self._ensure_remote_exists(clone_url, public_url)

        resolved_branch = branch.strip() if branch else None
        if resolved_branch:
            await self._ensure_branch_exists(clone_url, public_url, resolved_branch)
        elif branch_candidates:
            resolved_branch = await self._resolve_branch_candidates(clone_url, public_url, branch_candidates)
        else:
            resolved_branch = await self._resolve_default_branch(clone_url, public_url)

        return ResolvedGitHubRepo(public_url=public_url, clone_url=clone_url, branch=resolved_branch)

    async def clone_public_repo(self, repo_url: str, branch: str | None, destination: Path) -> Path:
        if not repo_url.startswith("https://github.com/"):
            raise RuntimeError("Only GitHub repositories are supported.")

        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            raise RuntimeError(f"Clone destination already exists: {destination}")

        clone_url = self._build_clone_url(repo_url)
        await self._run_clone(clone_url, repo_url, branch, destination)
        return destination

    async def _ensure_remote_exists(self, clone_url: str, public_url: str) -> None:
        completed = await self._run_git(["git", "ls-remote", clone_url, "HEAD"])
        if completed.returncode != 0:
            raise RuntimeError(self._sanitize_git_error(completed, public_url, clone_url, "GitHub repository check failed"))

    async def _ensure_branch_exists(self, clone_url: str, public_url: str, branch: str) -> None:
        completed = await self._run_git(["git", "ls-remote", "--heads", clone_url, branch])
        if completed.returncode != 0 or not (completed.stdout or "").strip():
            raise RuntimeError(f"Branch '{branch}' was not found for this repository.")

    async def _resolve_branch_candidates(self, clone_url: str, public_url: str, branch_candidates: list[str]) -> str:
        for candidate in branch_candidates:
            completed = await self._run_git(["git", "ls-remote", "--heads", clone_url, candidate])
            if completed.returncode == 0 and (completed.stdout or "").strip():
                return candidate

        resolved_branch = await self._resolve_default_branch(clone_url, public_url)
        if resolved_branch:
            return resolved_branch
        raise RuntimeError("Could not resolve the branch from the provided GitHub URL.")

    async def _resolve_default_branch(self, clone_url: str, public_url: str) -> str | None:
        completed = await self._run_git(["git", "ls-remote", "--symref", clone_url, "HEAD"])
        if completed.returncode != 0:
            raise RuntimeError(self._sanitize_git_error(completed, public_url, clone_url, "Failed to resolve repository default branch"))

        for line in (completed.stdout or "").splitlines():
            if line.startswith("ref: refs/heads/"):
                return line.split("refs/heads/", 1)[1].split("\t", 1)[0].strip()
        return None

    async def _run_clone(self, clone_url: str, public_url: str, branch: str | None, destination: Path) -> None:
        cmd = [
            "git",
            "clone",
            "--depth",
            "1",
            "--single-branch",
            "--filter=blob:none",
        ]
        if branch:
            cmd.extend(["--branch", branch])
        cmd.extend([clone_url, str(destination)])

        completed = await self._run_git(cmd)
        if completed.returncode == 0:
            return

        branch_hint = f" (branch: {branch})" if branch else ""
        message = self._sanitize_git_error(completed, public_url, clone_url, f"Git clone failed{branch_hint}")
        raise RuntimeError(message)

    async def _run_git(self, cmd: list[str]) -> subprocess.CompletedProcess[str]:
        return await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            check=False,
        )

    def _normalize_repo_input(self, repo_input: str) -> tuple[str, list[str]]:
        value = repo_input.strip()
        if not value:
            raise RuntimeError("Repository URL is required.")

        ssh_match = SSH_REPO_PATTERN.match(value)
        if ssh_match:
            owner = ssh_match.group("owner")
            repo = ssh_match.group("repo")
            self._validate_owner_repo(owner, repo)
            return f"https://github.com/{owner}/{repo}", []

        if value.startswith("github.com/") or value.startswith("www.github.com/"):
            value = f"https://{value}"
        elif value.startswith("http://"):
            value = f"https://{value[len('http://') :]}"

        parsed = urlparse(value)
        if parsed.netloc.lower() not in {"github.com", "www.github.com"}:
            raise RuntimeError("Repository URL must point to GitHub.")

        parts = [segment for segment in parsed.path.split("/") if segment]
        if len(parts) < 2:
            raise RuntimeError("Repository URL must include an owner and repository name.")

        owner = parts[0]
        repo = parts[1][:-4] if parts[1].endswith(".git") else parts[1]
        self._validate_owner_repo(owner, repo)

        public_url = f"https://github.com/{owner}/{repo}"
        branch_candidates = self._extract_branch_candidates(parts)
        return public_url, branch_candidates

    @staticmethod
    def _extract_branch_candidates(parts: list[str]) -> list[str]:
        if len(parts) < 4 or parts[2] not in {"tree", "blob"}:
            return []

        tail = parts[3:]
        return ["/".join(tail[:index]) for index in range(len(tail), 0, -1)]

    def _build_clone_url(self, public_url: str) -> str:
        if not self.github_token:
            return public_url

        parsed = urlparse(public_url)
        auth_netloc = f"x-access-token:{self.github_token}@{parsed.netloc}"
        return urlunparse(parsed._replace(netloc=auth_netloc))

    def _sanitize_git_error(self, completed: subprocess.CompletedProcess[str], public_url: str, clone_url: str, prefix: str) -> str:
        error_output = (completed.stderr or completed.stdout or "").strip()
        if not error_output:
            error_output = "Unknown git error. Ensure git is installed and network access to github.com is available."

        sanitized = error_output.replace(clone_url, public_url)
        if self.github_token:
            sanitized = sanitized.replace(self.github_token, "***")
        return f"{prefix}: {sanitized}"

    @staticmethod
    def _validate_owner_repo(owner: str, repo: str) -> None:
        if not GITHUB_SEGMENT_PATTERN.match(owner) or not GITHUB_SEGMENT_PATTERN.match(repo):
            raise RuntimeError("Repository URL includes unsupported characters.")

    def iter_source_files(self, repo_path: Path) -> list[Path]:
        rows: list[Path] = []

        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]

            for file_name in files:
                path = Path(root) / file_name
                extension = path.suffix.lower()
                if extension not in ALLOWED_EXTENSIONS:
                    continue

                try:
                    size = path.stat().st_size
                except OSError:
                    continue

                if size == 0 or size > self.max_file_size_bytes:
                    continue

                if self._looks_binary(path):
                    continue

                rows.append(path)

        rows.sort()
        return rows

    @staticmethod
    def _looks_binary(path: Path) -> bool:
        try:
            with path.open("rb") as handle:
                sample = handle.read(2048)
            return b"\x00" in sample
        except OSError:
            return True
