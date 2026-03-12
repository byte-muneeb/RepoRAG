import asyncio
import tempfile
from pathlib import Path

from app.services.chunking_service import ChunkingService
from app.services.embedding_service import EmbeddingService
from app.services.event_stream import broker
from app.services.github_service import GitHubService, detect_language
from app.services.repository_store import get_repo, set_file_tree
from app.services.tree_service import build_tree_from_paths
from app.services.vector_store_service import VectorStoreService


async def _publish_progress(repo_id: str, event_name: str, message: str, progress: int) -> None:
    await broker.publish_repo_event(
        repo_id,
        event_name,
        {
            "repo_id": repo_id,
            "message": message,
            "progress": progress,
        },
    )


async def run_ingestion_job(repo_id: str) -> None:
    repo = get_repo(repo_id)
    if not repo:
        return

    git_service = GitHubService()
    chunking = ChunkingService()
    embedding = EmbeddingService()
    vector_store = VectorStoreService()

    try:
        repo.status = "running"
        await broker.publish_repo_event(repo_id, "repo.queued", {"repo_id": repo_id})

        await _publish_progress(repo_id, "repo.clone.started", "Cloning repository...", 8)
        with tempfile.TemporaryDirectory(prefix=f"reporag-{repo_id[:8]}-") as temp_dir:
            clone_target = Path(temp_dir) / "repo"
            await git_service.clone_public_repo(repo.repo_url, repo.branch, clone_target)
            await _publish_progress(repo_id, "repo.clone.completed", "Clone complete.", 24)

            await _publish_progress(repo_id, "repo.parse.started", "Parsing source files...", 35)
            source_files = git_service.iter_source_files(clone_target)
            relative_paths = [path.relative_to(clone_target).as_posix() for path in source_files]

            repo.total_files = len(relative_paths)
            tree = build_tree_from_paths(relative_paths)
            set_file_tree(repo_id, [node.model_dump() for node in tree])

            await vector_store.upsert_repository(
                repo_id=repo.repo_id,
                repo_url=repo.repo_url,
                branch=repo.branch,
                status=repo.status,
                total_files=repo.total_files,
                indexed_files=repo.indexed_files,
            )

            if not source_files:
                repo.status = "ready"
                await _publish_progress(repo_id, "repo.ready", "Repository has no supported source files.", 100)
                return

            await _publish_progress(repo_id, "repo.embedding.started", "Generating Gemini embeddings...", 55)

            for index, file_path in enumerate(source_files):
                relative_path = file_path.relative_to(clone_target).as_posix()
                text = file_path.read_text(encoding="utf-8", errors="ignore")

                chunks = chunking.chunk_text(relative_path, text)
                if not chunks:
                    continue

                vectors = await embedding.embed_texts([chunk.content for chunk in chunks])

                file_id = await vector_store.upsert_file(
                    repository_id=repo.repo_id,
                    path=relative_path,
                    language=detect_language(relative_path),
                    size_bytes=file_path.stat().st_size,
                    sha=None,
                )

                if file_id is not None:
                    await vector_store.insert_chunks(repo.repo_id, file_id, chunks, vectors)

                repo.indexed_files += 1
                progress = 60 + int(((index + 1) / len(source_files)) * 38)
                await broker.publish_repo_event(
                    repo_id,
                    "repo.file.indexed",
                    {
                        "repo_id": repo_id,
                        "path": relative_path,
                        "indexed_files": repo.indexed_files,
                        "progress": min(98, progress),
                    },
                )

            repo.status = "ready"
            await vector_store.upsert_repository(
                repo_id=repo.repo_id,
                repo_url=repo.repo_url,
                branch=repo.branch,
                status=repo.status,
                total_files=repo.total_files,
                indexed_files=repo.indexed_files,
            )
            await broker.publish_repo_event(
                repo_id,
                "repo.ready",
                {
                    "repo_id": repo_id,
                    "message": "Repository is ready for RAG queries.",
                    "progress": 100,
                    "indexed_files": repo.indexed_files,
                    "total_files": repo.total_files,
                },
            )

    except Exception as exc:  # noqa: BLE001
        repo.status = "error"
        message = str(exc).strip() or repr(exc)
        repo.error_message = message
        await broker.publish_repo_event(
            repo_id,
            "repo.error",
            {
                "repo_id": repo_id,
                "message": message,
                "progress": 100,
            },
        )
