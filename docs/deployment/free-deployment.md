# Free Deployment Guide

RepoRAG supports a no-cost split deployment model:

- Frontend: Vercel
- Backend: Koyeb (web service from Dockerfile)
- Optional retrieval persistence: Supabase free tier

## 1. Deploy Backend on Koyeb

1. Create a new Koyeb web service from this GitHub repository.
2. Choose Docker deployment and select the root `Dockerfile`.
3. Set exposed HTTP port to `8000` (or leave auto-detect if Koyeb picks it from the image).

Required backend environment variables:

- `PORT=8000`
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
   - `VITE_API_BASE_URL=https://your-koyeb-service-url`
4. Deploy.

## 3. Validate Production Health

After both deployments are live:

1. Open `https://your-koyeb-service-url/v1/health`
2. Open `https://your-koyeb-service-url/v1/health/deps`
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