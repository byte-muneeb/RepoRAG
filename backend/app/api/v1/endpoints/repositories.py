import asyncio
import uuid

from fastapi import APIRouter, HTTPException

from app.db.schemas import FileTreeNode, RepoCreateRequest, RepoCreateResponse
from app.services.github_service import GitHubService
from app.services.repository_store import RepoRecord, get_file_tree, get_repo, set_repo
from app.workers.ingestion import run_ingestion_job

router = APIRouter()


@router.post("", response_model=RepoCreateResponse)
async def create_repository(request: RepoCreateRequest) -> RepoCreateResponse:
    git_service = GitHubService()
    try:
        resolved_repo = await git_service.resolve_repository(request.repo_url, request.branch)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    repo_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    set_repo(
        RepoRecord(
            repo_id=repo_id,
            repo_url=resolved_repo.public_url,
            branch=resolved_repo.branch,
            status="queued",
        ),
    )

    asyncio.create_task(run_ingestion_job(repo_id))

    return RepoCreateResponse(repo_id=repo_id, job_id=job_id, status="queued")


@router.get("/{repo_id}")
async def get_repository(repo_id: str) -> dict:
    repo = get_repo(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    return {
        "repo_id": repo.repo_id,
        "repo_url": repo.repo_url,
        "branch": repo.branch,
        "status": repo.status,
        "total_files": repo.total_files,
        "indexed_files": repo.indexed_files,
        "error_message": repo.error_message,
    }


@router.get("/{repo_id}/tree", response_model=list[FileTreeNode])
async def get_repository_tree(repo_id: str) -> list[FileTreeNode]:
    repo = get_repo(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    nodes = get_file_tree(repo_id)
    return [FileTreeNode(**node) for node in nodes]
