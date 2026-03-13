<div align="center">

# 🧠 RepoRAG

**Chat with any GitHub repository using AI-powered retrieval.**

Paste a GitHub URL → RepoRAG ingests the codebase → Ask questions and get grounded, context-aware answers.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-repo--rag--nu.vercel.app-blue?style=for-the-badge&logo=vercel)](https://repo-rag-nu.vercel.app/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=for-the-badge&logo=python)](https://python.org/)

</div>

---

## ✨ What is RepoRAG?

RepoRAG is a full-stack repository intelligence application. It turns any public GitHub repository into a searchable knowledge base you can query through a conversational AI interface.

The workflow is simple:

1. **Paste** a GitHub repository URL
2. **Wait** as RepoRAG clones, parses, chunks, embeds, and indexes the codebase in real time
3. **Chat** — ask anything about the code and get answers grounded in the actual source files

---

## 🚀 Features

| Feature | Description |
|---|---|
| **Repository Ingestion Pipeline** | Clone → parse → chunk → embed → index any GitHub repository |
| **Real-time Boot Telemetry** | Watch ingestion progress live via Server-Sent Events (SSE) |
| **Streaming Chat Responses** | Token-by-token LLM answers with retrieval lifecycle events |
| **RepoVIEW Graph** | Interactive 3D file/folder topology visualization powered by Three.js |
| **Context Picker** | Pin answers to specific files or folders for more precise responses |
| **Semantic Retrieval** | pgvector-backed embedding search for relevant code chunks |
| **Graceful Degradation** | App runs without Supabase; core flow and health checks stay fully functional |

---

## 🛠 Tech Stack

### Backend
- **[FastAPI](https://fastapi.tiangolo.com/)** — async REST API with SSE streaming
- **[arq](https://arq-docs.helpmanual.io/)** — async Redis job queue for background ingestion
- **[PostgreSQL 16 + pgvector](https://github.com/pgvector/pgvector)** — relational store with vector similarity search
- **[Redis 7](https://redis.io/)** — job queue and caching layer
- **[Groq](https://groq.com/)** (`llama-3.1-8b-instant`) — LLM for chat generation
- **[Google Gemini](https://ai.google.dev/)** (`embedding-001`) — text embeddings
- **[Supabase](https://supabase.com/)** *(optional)* — managed Postgres + vector RPC for production retrieval
- **[GitPython](https://gitpython.readthedocs.io/)** — repository cloning and parsing

### Frontend
- **[React 19](https://react.dev/) + [Vite 6](https://vitejs.dev/)** — fast, modern UI framework
- **[Three.js](https://threejs.org/) + [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)** — 3D graph visualization
- **[Tailwind CSS](https://tailwindcss.com/)** — utility-first styling
- **[Framer Motion](https://www.framer.com/motion/)** — smooth UI animations
- **[Zustand](https://github.com/pmndrs/zustand)** — lightweight state management
- **[React Markdown](https://github.com/remarkjs/react-markdown)** — renders code-rich AI responses

### Infrastructure
- **[Docker](https://docker.com/)** — containerized backend and local dev services
- **[Vercel](https://vercel.com/)** — frontend hosting
- **[Hugging Face Spaces](https://huggingface.co/spaces)** *(Docker SDK)* — backend hosting

---

## 📦 Repository Layout

```text
RepoRAG/
├── backend/              # FastAPI app, ingestion worker, retrieval services
│   ├── app/
│   │   ├── api/v1/       # Endpoints: health, repos, events, chat
│   │   ├── core/         # App configuration
│   │   ├── db/           # Database schemas and SQL queries
│   │   ├── services/     # Chunking, embedding, vector store, GitHub, chat
│   │   └── workers/      # Async ingestion worker (arq)
│   ├── tests/
│   ├── Dockerfile        # Image for Hugging Face Spaces
│   └── .env.example
├── frontend/             # React + Vite UI
│   ├── src/
│   │   ├── components/   # LoadingView, WorkspaceView
│   │   ├── lib/          # API client
│   │   └── realtime/     # SSE handling
│   └── .env.example
├── infra/
│   └── docker-compose.yml  # Local PostgreSQL 16 + Redis 7
├── docs/                 # Architecture and deployment guides
├── scripts/              # Bootstrap, dev, and deploy-check scripts
├── Dockerfile            # Root OCI image (Koyeb, Render, etc.)
└── render.yaml           # Optional Render deployment manifest
```

---

## ⚡ Quick Start

### Prerequisites

- **Node.js** 20+
- **Python** 3.11+
- **Git**
- **Docker Desktop** *(optional — for local Postgres and Redis)*

### 1. Bootstrap

```powershell
# Install frontend and backend dependencies; optionally start local infra
./scripts/bootstrap.ps1 -StartInfra
```

### 2. Configure environment

Copy and fill in the environment templates:

```powershell
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

See [Environment Variables](#-environment-variables) for required values.

### 3. Start dev servers

```powershell
./scripts/dev.ps1
```

| Service | URL |
|---|---|
| Frontend | http://127.0.0.1:5173 |
| Backend API docs | http://127.0.0.1:8000/docs |

---

### Manual Setup (without scripts)

<details>
<summary>Backend</summary>

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

</details>

<details>
<summary>Frontend</summary>

```bash
cd frontend
npm install
npm run dev
```

</details>

<details>
<summary>Local infrastructure (Postgres + Redis)</summary>

```bash
cd infra
docker compose up -d
```

</details>

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | ✅ | Chat generation via Groq LLM |
| `GEMINI_API_KEY` | ✅ | Text embeddings via Google Gemini |
| `SUPABASE_URL` | ⭐ Recommended | Supabase project URL (recommended for full retrieval) |
| `SUPABASE_SERVICE_ROLE_KEY` | ⭐ Recommended | Supabase service role key |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `GITHUB_TOKEN` | Optional | Higher GitHub API rate limits |
| `GROQ_MODEL` | Optional | Defaults to `llama-3.1-8b-instant` |
| `GEMINI_EMBEDDING_MODEL` | Optional | Defaults to `models/embedding-001` |
| `MAX_REPO_SIZE_MB` | Optional | Max repository size (default: `1024`) |
| `MAX_FILE_SIZE_KB` | Optional | Max individual file size (default: `1024`) |

> **Note:** If Supabase is not configured, health endpoints and core app flow still run but vector search and retrieval persistence will not be available.

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | ✅ | Backend base URL (e.g. `http://127.0.0.1:8000`) |

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Service metadata |
| `GET` | `/v1/health` | Liveness check |
| `GET` | `/v1/health/deps` | Dependency configuration status |
| `POST` | `/v1/repos` | Start repository ingestion; returns `repo_id` |
| `GET` | `/v1/repos/{repo_id}` | Latest ingestion snapshot |
| `GET` | `/v1/repos/{repo_id}/tree` | Normalized file tree |
| `GET` | `/v1/repos/{repo_id}/events` | SSE stream for ingestion progress |
| `POST` | `/v1/chat/stream` | SSE stream of retrieval lifecycle events + tokens |

Full interactive docs available at `/docs` when the backend is running.

---

## 🌍 Deployment

The recommended free-tier stack:

| Layer | Service |
|---|---|
| Frontend | [Vercel](https://vercel.com/) |
| Backend | [Hugging Face Spaces](https://huggingface.co/spaces) (Docker SDK) |
| Vector storage | [Supabase](https://supabase.com/) free tier *(optional)* |

See [docs/deployment/free-deployment.md](docs/deployment/free-deployment.md) for the complete, step-by-step deployment guide.

### Docker (generic OCI platforms)

```bash
# Build and run the root image (Koyeb, Render, etc.)
docker build -t reporag-api .
docker run -p 8000:8000 --env-file backend/.env reporag-api

# Backend-specific image (Hugging Face Spaces)
docker build -f backend/Dockerfile -t reporag-backend .
```

---

## ✅ Verification

```powershell
# Frontend production build
npm --prefix frontend run build

# Backend test suite
backend/.venv/Scripts/python.exe -m pytest -q backend/tests

# Full deploy-readiness check (build + tests + live smoke checks)
./scripts/deploy-check.ps1
```

---

## 📚 Documentation

- [docs/README.md](docs/README.md) — documentation index
- [docs/architecture/full-stack-blueprint.md](docs/architecture/full-stack-blueprint.md) — system layers, runtime flow, and API contracts
- [docs/deployment/free-deployment.md](docs/deployment/free-deployment.md) — production deployment guide

