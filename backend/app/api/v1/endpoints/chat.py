import asyncio
import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.db.schemas import ChatStreamRequest
from app.services.chat_generation_service import ChatGenerationService
from app.services.embedding_service import EmbeddingService
from app.services.vector_store_service import VectorStoreService

router = APIRouter()

chat_service = ChatGenerationService()
_embedding_service = EmbeddingService()
_vector_store = VectorStoreService()

MAX_MATCH_COUNT = 10
MAX_CONTEXT_CHUNKS = 8
MAX_CHUNK_CHARS = 1400
RETRIEVAL_TIMEOUT_SECONDS = 12
MAX_CITATIONS = 6


def _normalize_path(file_path: str) -> str:
    return (file_path or "").replace("\\", "/").lstrip("./")


def _is_noise_path(file_path: str) -> bool:
    lower_path = _normalize_path(file_path).lower()
    noise_markers = (
        "skills/",
        "docs/superpowers/",
        ".claude",
        ".codex",
        ".cursor",
        ".opencode",
        "agents/",
        "commands/",
        "node_modules/",
        "dist/",
        "build/",
        ".next/",
        "coverage/",
    )

    low_signal_names = (
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "bun.lockb",
        "poetry.lock",
        "cargo.lock",
    )

    if lower_path.endswith(low_signal_names):
        return True

    return any(marker in lower_path for marker in noise_markers)


def _question_targets_dependencies(question: str) -> bool:
    q = (question or "").lower()
    markers = (
        "dependency",
        "dependencies",
        "package-lock",
        "yarn.lock",
        "pnpm-lock",
        "npm package",
        "version",
        "vulnerab",
        "license",
        "sbom",
    )
    return any(marker in q for marker in markers)


def _finalize_citations(citations: list[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for citation in citations:
        normalized = _normalize_path(citation)
        if not normalized or normalized in seen:
            continue
        if _is_noise_path(normalized):
            continue
        seen.add(normalized)
        unique.append(normalized)
        if len(unique) >= MAX_CITATIONS:
            break
    return unique


async def _build_context(repo_id: str, question: str, context_file_paths: list[str]) -> tuple[str, list[str]]:
    context_parts: list[str] = []
    citations: list[str] = []
    selected_paths = {_normalize_path(path) for path in context_file_paths if _normalize_path(path)}
    allow_low_signal = _question_targets_dependencies(question)

    # Highest priority: directly read chunks for explicitly selected files.
    if _vector_store.enabled and selected_paths:
        selected_chunks = await _vector_store.get_chunks_for_paths(
            repo_id=repo_id,
            file_paths=list(selected_paths),
            chunks_per_file=2,
            max_total=MAX_CONTEXT_CHUNKS,
        )

        for chunk in selected_chunks:
            file_path = _normalize_path(chunk.get("file_path", "unknown"))
            start = chunk.get("start_line", "?")
            end = chunk.get("end_line", "?")
            content = (chunk.get("content", "") or "")[:MAX_CHUNK_CHARS]
            context_parts.append(
                f"### {file_path} (lines {start}-{end})\n```\n{content}\n```"
            )
            citations.append(f"{file_path}:{start}")

        if context_parts:
            context = "\n\n".join(context_parts)
            return context, citations

    # Fallback: semantic retrieval.
    if _vector_store.enabled:
        query_vectors = await _embedding_service.embed_texts([question])
        chunks = await _vector_store.search_chunks(
            repo_id=repo_id,
            query_vector=query_vectors[0],
            match_count=MAX_MATCH_COUNT,
        )
        accepted = 0
        for chunk in chunks:
            if accepted >= MAX_CONTEXT_CHUNKS:
                break

            file_path = _normalize_path(chunk.get("file_path", "unknown"))

            # If user selected files, strictly ground retrieval to that selection.
            if selected_paths and file_path not in selected_paths:
                continue

            # Otherwise skip noisy tool-instruction paths that can pollute answers.
            if not selected_paths and _is_noise_path(file_path) and not allow_low_signal:
                continue

            start = chunk.get("start_line", "?")
            end = chunk.get("end_line", "?")
            content = (chunk.get("content", "") or "")[:MAX_CHUNK_CHARS]
            context_parts.append(
                f"### {file_path} (lines {start}-{end})\n```\n{content}\n```"
            )
            citations.append(f"{file_path}:{start}")
            accepted += 1

    if not context_parts and context_file_paths:
        top_paths = [_normalize_path(path) for path in context_file_paths[:6]]
        context_parts = [
            "Selected files are not indexed yet. "
            f"Please wait for indexing to complete. Selected: {', '.join(top_paths)}"
        ]

    context = "\n\n".join(context_parts) if context_parts else "No specific code context available."
    return context, citations


@router.post("/stream")
async def stream_chat(request: ChatStreamRequest) -> EventSourceResponse:
    async def token_stream() -> AsyncGenerator[dict, None]:
        accumulated = ""
        citations: list[str] = []

        try:
            retrieval_payload = {
                "event": "rag.retrieval.started",
                "repo_id": request.repo_id,
                "question": request.question,
            }
            yield {"event": "message", "data": json.dumps(retrieval_payload)}
            await asyncio.sleep(0.05)

            try:
                context, citations = await asyncio.wait_for(
                    _build_context(request.repo_id, request.question, request.context_file_paths),
                    timeout=RETRIEVAL_TIMEOUT_SECONDS,
                )
            except TimeoutError:
                context = "No specific code context available. Retrieval timed out, so answer using general project knowledge."
                citations = []
            except Exception:  # noqa: BLE001
                context = "No specific code context available. Retrieval failed, so answer using general project knowledge."
                citations = []

            async for token in chat_service.stream_answer(request.question, context):
                accumulated = f"{accumulated}{token}"
                payload = {
                    "event": "rag.token",
                    "repo_id": request.repo_id,
                    "token": token,
                    "accumulated_text": accumulated.strip(),
                }
                yield {"event": "message", "data": json.dumps(payload)}
        except Exception as exc:  # noqa: BLE001
            if not accumulated:
                accumulated = f"Unable to complete response: {exc}"

        completion_payload = {
            "event": "rag.completed",
            "repo_id": request.repo_id,
            "text": accumulated.strip() or "No response generated.",
            "citations": _finalize_citations(citations),
        }
        yield {"event": "message", "data": json.dumps(completion_payload)}

    return EventSourceResponse(token_stream())
