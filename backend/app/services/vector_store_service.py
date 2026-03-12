import asyncio
import logging
from typing import Any

from supabase import Client, create_client

from app.core.config import settings
from app.services.chunking_service import ChunkRow

logger = logging.getLogger(__name__)


class VectorStoreService:
    def __init__(self) -> None:
        self.client: Client | None = None
        if settings.supabase_url and settings.supabase_service_role_key:
            self.client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    @property
    def enabled(self) -> bool:
        return self.client is not None

    async def upsert_repository(
        self,
        repo_id: str,
        repo_url: str,
        branch: str | None,
        status: str,
        total_files: int,
        indexed_files: int,
    ) -> None:
        if not self.client:
            return

        payload = {
            "id": repo_id,
            "repo_url": repo_url,
            "default_branch": branch,
            "status": status,
            "total_files": total_files,
            "indexed_files": indexed_files,
        }

        try:
            await asyncio.to_thread(
                lambda: self.client.table("repositories").upsert(payload).execute(),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Supabase upsert_repository failed: %s", exc)

    async def upsert_file(
        self,
        repository_id: str,
        path: str,
        language: str,
        size_bytes: int,
        sha: str | None = None,
    ) -> int | None:
        if not self.client:
            return None

        payload = {
            "repository_id": repository_id,
            "path": path,
            "language": language,
            "sha": sha,
            "size_bytes": size_bytes,
            "is_binary": False,
        }

        try:
            response = await asyncio.to_thread(
                lambda: self.client.table("repo_files").upsert(payload, on_conflict="repository_id,path").execute(),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Supabase upsert_file failed (%s): %s", path, exc)
            return None

        data = getattr(response, "data", None) or []
        if data and isinstance(data[0], dict):
            return data[0].get("id")
        return None

    async def insert_chunks(
        self,
        repository_id: str,
        file_id: int,
        chunks: list[ChunkRow],
        vectors: list[list[float]],
    ) -> None:
        if not self.client or not chunks:
            return

        rows: list[dict[str, Any]] = []
        for chunk, vector in zip(chunks, vectors, strict=False):
            rows.append(
                {
                    "repository_id": repository_id,
                    "file_id": file_id,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "token_count": max(1, len(chunk.content) // 4),
                    "metadata": {"path": chunk.file_path},
                    "embedding": vector,
                },
            )

        batch_size = 40
        for offset in range(0, len(rows), batch_size):
            batch = rows[offset : offset + batch_size]
            try:
                await asyncio.to_thread(
                    lambda b=batch: self.client.table("code_chunks").insert(b).execute(),
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Supabase insert_chunks failed for repo=%s file_id=%s: %s", repository_id, file_id, exc)
                return

    async def search_chunks(
        self,
        repo_id: str,
        query_vector: list[float],
        match_count: int = 8,
    ) -> list[dict[str, Any]]:
        """Semantic search using the match_documents pgvector RPC function."""
        if not self.client:
            return []

        try:
            response = await asyncio.to_thread(
                lambda: self.client.rpc(
                    "match_documents",
                    {
                        "query_embedding": query_vector,
                        "match_repo_id": repo_id,
                        "match_count": match_count,
                    },
                ).execute(),
            )
            return response.data or []
        except Exception as exc:  # noqa: BLE001
            logger.warning("Supabase search_chunks failed for repo=%s: %s", repo_id, exc)
            return []

    async def get_chunks_for_paths(
        self,
        repo_id: str,
        file_paths: list[str],
        chunks_per_file: int = 2,
        max_total: int = 8,
    ) -> list[dict[str, Any]]:
        """Fetch early chunks for selected files to guarantee file-grounded context."""
        if not self.client or not file_paths:
            return []

        cleaned_paths: list[str] = []
        for path in file_paths:
            normalized = (path or "").replace("\\", "/").lstrip("./")
            if normalized and normalized not in cleaned_paths:
                cleaned_paths.append(normalized)

        rows: list[dict[str, Any]] = []
        for path in cleaned_paths:
            if len(rows) >= max_total:
                break

            try:
                file_response = await asyncio.to_thread(
                    lambda p=path: self.client.table("repo_files")
                    .select("id,path")
                    .eq("repository_id", repo_id)
                    .eq("path", p)
                    .limit(1)
                    .execute(),
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Supabase get_chunks_for_paths file lookup failed for repo=%s path=%s: %s", repo_id, path, exc)
                continue

            file_data = getattr(file_response, "data", None) or []
            if not file_data or not isinstance(file_data[0], dict):
                continue

            file_id = file_data[0].get("id")
            file_path = file_data[0].get("path") or path
            if file_id is None:
                continue

            try:
                chunk_response = await asyncio.to_thread(
                    lambda fid=file_id: self.client.table("code_chunks")
                    .select("content,start_line,end_line,chunk_index")
                    .eq("repository_id", repo_id)
                    .eq("file_id", fid)
                    .order("chunk_index")
                    .limit(chunks_per_file)
                    .execute(),
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("Supabase get_chunks_for_paths chunk lookup failed for repo=%s file_id=%s: %s", repo_id, file_id, exc)
                continue

            chunk_data = getattr(chunk_response, "data", None) or []
            for chunk in chunk_data:
                if not isinstance(chunk, dict):
                    continue
                rows.append(
                    {
                        "file_path": file_path,
                        "content": chunk.get("content", ""),
                        "start_line": chunk.get("start_line", "?"),
                        "end_line": chunk.get("end_line", "?"),
                    },
                )
                if len(rows) >= max_total:
                    break

        return rows
