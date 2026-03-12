import re
from typing import Literal
from urllib.parse import urlparse, urlunparse

from pydantic import BaseModel, Field, field_validator

GITHUB_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")
SSH_PREFIXES = ("git@github.com:", "ssh://git@github.com/")


def _normalize_github_repo_url(repo_url: str) -> str:
    value = repo_url.strip()
    if not value:
        raise ValueError("Repository URL is required.")

    if value.startswith(SSH_PREFIXES):
        return value.rstrip("/")

    if value.startswith("github.com/") or value.startswith("www.github.com/"):
        value = f"https://{value}"
    elif value.startswith("http://"):
        value = f"https://{value[len('http://') :]}"

    parsed = urlparse(value)
    host = parsed.netloc.lower()
    if host not in {"github.com", "www.github.com"}:
        raise ValueError("Repository URL must point to GitHub.")

    parts = [segment for segment in parsed.path.split("/") if segment]
    if len(parts) < 2:
        raise ValueError("Repository URL must include an owner and repository name.")

    owner = parts[0]
    repo = parts[1][:-4] if parts[1].endswith(".git") else parts[1]
    if not GITHUB_SEGMENT_PATTERN.match(owner) or not GITHUB_SEGMENT_PATTERN.match(repo):
        raise ValueError("Repository URL includes unsupported characters.")

    normalized_parts = [owner, repo, *parts[2:]]
    normalized_path = "/" + "/".join(normalized_parts)
    return urlunparse(("https", "github.com", normalized_path.rstrip("/"), "", "", ""))


class RepoCreateRequest(BaseModel):
    repo_url: str = Field(..., examples=["https://github.com/owner/repo"])
    branch: str | None = Field(default=None)

    @field_validator("repo_url")
    @classmethod
    def validate_repo_url(cls, value: str) -> str:
        return _normalize_github_repo_url(value)

    @field_validator("branch")
    @classmethod
    def normalize_branch(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None


class RepoCreateResponse(BaseModel):
    repo_id: str
    job_id: str
    status: Literal["queued", "running", "ready", "error"]


class ChatStreamRequest(BaseModel):
    repo_id: str
    question: str
    context_file_paths: list[str] = Field(default_factory=list)


class FileTreeNode(BaseModel):
    id: str
    parent_id: str | None
    type: Literal["file", "folder"]
    name: str
    path: str
    depth: int
    indexed: bool = False
