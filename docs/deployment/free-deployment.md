# Free Deployment Guide

RepoRAG supports a no-cost split deployment model:

- Frontend: Vercel
- Backend: Hugging Face Spaces (Docker SDK)
- Optional retrieval persistence: Supabase free tier

## 1. Create Backend Space on Hugging Face

1. Open `https://huggingface.co/new-space`.
2. Create space:
   - Name: `reporag-api`
   - SDK: `Docker`
   - Template: `Blank`
3. Open the `Files` tab in the created Space.

## 2. Upload Backend Files (GitHub Bypass Path)

Upload these items from the local `backend/` folder into the Space root:

- `Dockerfile`
- `requirements.txt`
- `app/`
- `db/`

Then commit the upload in the Space UI (`Commit changes to main`).

## 3. Add Backend Secrets in Space Settings

In the Space `Settings` tab under `Variables and secrets`, add:

- `PORT=7860`
- `ENVIRONMENT=production`
- `CORS_ORIGINS=["https://your-project.vercel.app"]`
  - or `CORS_ORIGIN_REGEX=https://.*\.vercel\.app$` for preview deployments
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `SUPABASE_URL` (recommended)
- `SUPABASE_SERVICE_ROLE_KEY` (recommended)
- `GITHUB_TOKEN` (optional)

Once secrets are saved, the Space automatically rebuilds.

## 4. Deploy Frontend on Vercel

1. Import this repository into Vercel.
2. Set project root to `frontend`.
3. Add environment variable:
   - `VITE_API_BASE_URL=https://your-username-reporag-api.hf.space`
4. Deploy or redeploy.

## 5. Validate Production Health

After both deployments are live:

1. Open `https://your-username-reporag-api.hf.space/v1/health`
2. Open `https://your-username-reporag-api.hf.space/v1/health/deps`
3. Confirm frontend can:
   - submit a repository URL
   - receive loading events
   - enter workspace and send a chat query

## 6. Local Pre-Deploy Verification

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