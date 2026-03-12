from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings


def create_application() -> FastAPI:
    app = FastAPI(
        title="RepoRAG API",
        version="0.1.0",
        description="Backend API for repository ingestion and real-time RAG streaming.",
    )

    allow_origin_regex = settings.cors_origin_regex or (
        r"https?://(localhost|127\.0\.0\.1)(:\d+)?$" if settings.environment == "development" else None
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=allow_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/", tags=["meta"])
    async def root() -> dict[str, str]:
        return {"service": "RepoRAG API", "status": "ok"}

    app.include_router(api_router, prefix="/v1")
    return app


app = create_application()

