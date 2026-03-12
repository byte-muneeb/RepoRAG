import asyncio
import subprocess
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.services.github_service import GitHubService


def test_should_retry_without_token_on_auth_failure() -> None:
    service = GitHubService()
    service.github_token = "bad-token"
    result = subprocess.CompletedProcess(
        args=["git", "ls-remote"],
        returncode=128,
        stdout="",
        stderr="remote: Invalid username or token. fatal: Authentication failed",
    )

    assert service._should_retry_without_token(result, "https://x-access-token:bad-token@github.com/org/repo", "https://github.com/org/repo") is True


def test_should_not_retry_without_token_when_no_token_is_set() -> None:
    service = GitHubService()
    service.github_token = ""
    result = subprocess.CompletedProcess(
        args=["git", "ls-remote"],
        returncode=128,
        stdout="",
        stderr="fatal: repository not found",
    )

    assert service._should_retry_without_token(result, "https://github.com/org/repo", "https://github.com/org/repo") is False


def test_ensure_remote_exists_falls_back_to_public_url() -> None:
    service = GitHubService()
    service.github_token = "bad-token"

    responses = [
        subprocess.CompletedProcess(
            args=["git", "ls-remote"],
            returncode=128,
            stdout="",
            stderr="remote: Invalid username or token. fatal: Authentication failed",
        ),
        subprocess.CompletedProcess(
            args=["git", "ls-remote"],
            returncode=0,
            stdout="ref\tHEAD",
            stderr="",
        ),
    ]

    async def fake_run_git(cmd: list[str]) -> subprocess.CompletedProcess[str]:
        return responses.pop(0)

    service._run_git = fake_run_git  # type: ignore[method-assign]
    clone_url = service._build_clone_url("https://github.com/org/repo")

    result = asyncio.run(service._ensure_remote_exists(clone_url, "https://github.com/org/repo"))

    assert result == "https://github.com/org/repo"
