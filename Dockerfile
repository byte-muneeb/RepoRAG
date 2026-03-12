# RepoRAG Backend — Docker image
# Compatible with Hugging Face Spaces (port 7860) and Koyeb / any OCI-compatible platform.
#
# Build:  docker build -t reporag-api .
# Run:    docker run -p 7860:7860 --env-file backend/.env reporag-api

FROM python:3.11-slim

# git is required by gitpython for repository cloning
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (layer-cached until requirements change)
COPY backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY backend/app ./app

# Hugging Face Spaces requires port 7860 by default.
# Koyeb and other platforms inject $PORT at runtime — honour that.
ENV PORT=7860
ENV HOST=0.0.0.0
ENV ENVIRONMENT=production

EXPOSE 7860

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
