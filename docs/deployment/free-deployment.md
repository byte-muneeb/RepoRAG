# Free Deployment Guide

RepoRAG supports a no-cost split deployment model:

- Frontend: Vercel
- Backend: Render (web service)
- Optional retrieval persistence: Supabase free tier

## 1. Deploy Backend on Render

1. Create a new Render web service from this repository.
2. Keep the service root at the repository root so Render can detect `render.yaml`.
3. Confirm it uses the `reporag-backend` service configuration.

Required backend environment variables:

- `PORT=10000`
- `ENVIRONMENT=production`
- `CORS_ORIGINS=["https://your-project.vercel.app"]`
  - or `CORS_ORIGIN_REGEX=https://.*\.vercel\.app$` for preview deployments
- `GROQ_API_KEY`
- `GEMINI_API_KEY`

Optional/advanced:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_TOKEN`

## 2. Deploy Frontend on Vercel

1. Import the same repository into Vercel.
2. Set the project root directory to `frontend`.
3. Add environment variable:
   - `VITE_API_BASE_URL=https://your-render-service.onrender.com`
4. Deploy.

## 3. Validate Production Health

After both deployments are live:

1. Open `https://your-render-service.onrender.com/v1/health`
2. Open `https://your-render-service.onrender.com/v1/health/deps`
3. Confirm frontend can:
   - submit a repository URL
   - receive loading events
   - enter workspace and send a chat query

## 4. Local Pre-Deploy Verification

Run before each release:

```powershell
./scripts/deploy-check.ps1
```

This script checks:

- frontend production build
- backend pytest suite
- live backend smoke endpoints (`/v1/health`, `/v1/health/deps`)

## Behavior Without Supabase

Without `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`:

- app still boots and streams
- health endpoints remain available
- retrieval persistence/vector search quality is reduced

For best answer grounding and citations, configure Supabase.