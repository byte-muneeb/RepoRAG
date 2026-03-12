---
title: RepoRAG API
emoji: 🔍
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
app_port: 7860
---

# RepoRAG

RepoRAG is a full-stack repository intelligence app. You paste a GitHub URL, RepoRAG ingests the codebase, and you chat with grounded responses that reference repository context.

The workspace is structured as a monorepo with:

- a React + Vite frontend
- a FastAPI backend with SSE streaming
- optional pgvector-backed retrieval via Supabase

## Core Features

- Repository ingestion pipeline: clone, parse, chunk, embed, index
- Real-time boot telemetry through server-sent events
- Streaming chat responses with retrieval lifecycle events
- RepoVIEW graph visualization for file/folder topology
- Context picker to ground answers to selected files or folders
- Back-to-landing UX controls from loading and workspace stages

## Repository Layout

```text
REPORAG/
  backend/                 # FastAPI API, ingestion worker, retrieval services
  frontend/                # React UI, loading/workspace stages, RepoVIEW graph
  docs/                    # Architecture and deployment documentation
  infra/                   # Local Postgres/Redis compose setup
  scripts/                 # Bootstrap, dev startup, deploy verification
  render.yaml              # Render backend deployment manifest
```

## Prerequisites

- Node.js 20+
- Python 3.11+
- Git
- Optional: Docker Desktop (for local Postgres/Redis)

## Quick Start

```powershell
# Install frontend + backend dependencies and optionally start local infra
./scripts/bootstrap.ps1 -StartInfra

# Launch frontend and backend dev servers in new terminals
./scripts/dev.ps1
```

- Frontend: http://127.0.0.1:5173
- Backend docs: http://127.0.0.1:8000/docs

## Environment Configuration

- Backend template: `backend/.env.example`
- Frontend template: `frontend/.env.example`

Minimum backend values for full cloud retrieval:

- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional but recommended:

- `GITHUB_TOKEN` for higher GitHub API limits

If Supabase is not configured, health endpoints and core app flow still run, but semantic retrieval persistence is degraded.

## Verification Commands

```powershell
# Frontend production build
npm --prefix frontend run build

# Backend tests
backend/.venv/Scripts/python.exe -m pytest -q backend/tests

# End-to-end deploy readiness check
./scripts/deploy-check.ps1
```

`deploy-check.ps1` validates:

- frontend production build
- backend pytest suite
- live backend smoke checks for `/v1/health` and `/v1/health/deps`

## Free Deployment

Recommended free split:

- Frontend on Vercel
- Backend on Render
- Optional vector storage on Supabase free tier

See [docs/deployment/free-deployment.md](docs/deployment/free-deployment.md) for the full, tested flow.

## Documentation Map

- [docs/README.md](docs/README.md)
- [docs/architecture/full-stack-blueprint.md](docs/architecture/full-stack-blueprint.md)
- [docs/deployment/free-deployment.md](docs/deployment/free-deployment.md)
