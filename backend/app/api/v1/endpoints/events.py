import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.services.event_stream import broker
from app.services.repository_store import get_repo

router = APIRouter()


def _estimate_progress(status: str, indexed_files: int, total_files: int) -> int:
    if status == "queued":
        return 3
    if status == "ready":
        return 100
    if status == "error":
        return 100
    if total_files > 0:
        return min(98, 60 + int((indexed_files / total_files) * 38))
    return 24


@router.get("/{repo_id}/events")
async def stream_repo_events(repo_id: str) -> EventSourceResponse:
    repo = get_repo(repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    async def event_generator() -> AsyncGenerator[dict, None]:
        snapshot = {
            "repo_id": repo.repo_id,
            "status": repo.status,
            "indexed_files": repo.indexed_files,
            "total_files": repo.total_files,
            "error_message": repo.error_message,
            "progress": _estimate_progress(repo.status, repo.indexed_files, repo.total_files),
        }
        yield {"event": "repo.snapshot", "data": json.dumps(snapshot)}

        async for event in broker.subscribe_repo(repo_id):
            yield {
                "event": event.event,
                "data": json.dumps(event.data),
            }

    return EventSourceResponse(event_generator())
