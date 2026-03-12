# RepoRAG Full-Stack Blueprint

## System Overview

RepoRAG is a staged repository intelligence application:

1. Landing: user enters a GitHub repository URL.
2. Loading: backend ingests and streams progress events.
3. Workspace: user explores tree/graph and chats with retrieval-grounded context.

## Layers

- Frontend (`frontend/`)
	- React + Vite + Framer Motion
	- Stage-based UX (`LANDING`, `LOADING`, `WORKSPACE`)
	- RepoVIEW graph and contextual chat panel
- Backend (`backend/`)
	- FastAPI API routers under `app/api/v1`
	- SSE event stream for ingestion and chat token output
	- Ingestion worker for clone/chunk/embed/index flow
- Data and Infra (`infra/` and external services)
	- Optional local Postgres/Redis for development
	- Optional Supabase for persistent retrieval/vector search

## API Contracts

- `POST /v1/repos` starts ingestion and returns `repo_id`
- `GET /v1/repos/{repo_id}/events` streams ingestion events
- `GET /v1/repos/{repo_id}` returns latest repo ingestion snapshot
- `GET /v1/repos/{repo_id}/tree` returns normalized file tree nodes
- `POST /v1/chat/stream` streams retrieval lifecycle and token events
- `GET /v1/health` and `GET /v1/health/deps` provide service/dependency health

## Runtime Flow

1. Frontend validates GitHub URL and calls `POST /v1/repos`.
2. Backend resolves repository metadata and spawns async ingestion.
3. Loading view listens to `/v1/repos/{repo_id}/events` and updates progress/telemetry.
4. On `repo.ready`, frontend enters workspace.
5. Workspace loads tree from `GET /v1/repos/{repo_id}/tree`.
6. User asks a question via `POST /v1/chat/stream` with optional selected file paths.
7. Frontend renders token stream until `rag.completed` and displays citations.
8. User can return to landing from loading/workspace with explicit back controls.

## Data Behavior by Mode

- With Supabase configured:
	- repository/files/chunks persisted
	- vector RPC retrieval via `match_documents`
	- stronger grounded citations
- Without Supabase configured:
	- health and core flow still run
	- ingestion and chat continue in degraded mode
	- persistence and semantic retrieval quality are reduced

## Deployment Topology

- Frontend: Vercel static hosting (`frontend/`)
- Backend: Hugging Face Spaces Docker runtime (manual upload from `backend/`)
- Optional: Supabase free tier for vector persistence

See deployment details in `docs/deployment/free-deployment.md`.

## Known Tradeoffs

- In-memory repository store resets on backend restart.
- Free-tier hosts can introduce cold starts.
- Large Three.js vendor bundle can trigger chunk-size build warnings.
