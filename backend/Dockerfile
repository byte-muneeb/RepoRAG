# RepoRAG backend image for Hugging Face Spaces (Docker SDK)
# Expected files in the Space root:
# - Dockerfile
# - requirements.txt
# - app/
# - db/

FROM python:3.11-slim

# git is required by gitpython for repository cloning during ingestion
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY db ./db

ENV PORT=7860
ENV HOST=0.0.0.0
ENV ENVIRONMENT=production

EXPOSE 7860

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}