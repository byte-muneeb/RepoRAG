# RepoRAG Backend

FastAPI service for repository ingestion, retrieval orchestration, and streaming chat.

## Responsibilities

- Accept repository ingestion requests
- Stream ingestion progress events over SSE
- Build code context from vector retrieval and selected file paths
- Stream token responses for chat
- Report health and dependency configuration status

## Local Setup

```powershell
Set-Location backend
python -m venv .venv
. .venv/Scripts/Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API docs: http://127.0.0.1:8000/docs

## Environment Variables

Use `backend/.env.example` as the baseline.

- `ENVIRONMENT` default `development`
- `HOST` default `0.0.0.0`
- `PORT` default `8000`
- `CORS_ORIGINS` JSON array of allowed origins
- `CORS_ORIGIN_REGEX` optional regex for dynamic origins
- `GROQ_API_KEY` required for real LLM responses
- `GEMINI_API_KEY` required for real embeddings
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` required for persistent vector retrieval
- `GITHUB_TOKEN` optional rate-limit relief for GitHub API operations

## API Surface

- `GET /` service metadata
- `GET /v1/health` basic liveness
- `GET /v1/health/deps` safe dependency/config state
- `POST /v1/repos` start ingestion for a GitHub repository
- `GET /v1/repos/{repo_id}` ingestion snapshot
- `GET /v1/repos/{repo_id}/tree` normalized repository tree
- `GET /v1/repos/{repo_id}/events` SSE stream for ingestion telemetry
- `POST /v1/chat/stream` SSE chat stream with retrieval lifecycle and tokens

## Ingestion and Retrieval Notes

- Ingestion runs async after `POST /v1/repos` and updates in-memory repository state.
- If Supabase is configured, repository/file/chunk data is persisted and searchable.
- Without Supabase, the app still boots and streams, but retrieval persistence is limited.
- SQL helpers are under `db/sql/`:
	- `schema.sql`
	- `match_documents.sql`

## Tests

```powershell
Set-Location backend
.\.venv\Scripts\python.exe -m pytest -q
```

## Deployment Notes

- Render backend deployment is configured in the repo root `render.yaml`.
- Set production CORS via `CORS_ORIGINS` or `CORS_ORIGIN_REGEX`.
- Pair with frontend `VITE_API_BASE_URL` pointing at the deployed backend.
