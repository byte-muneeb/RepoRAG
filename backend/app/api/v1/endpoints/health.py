from fastapi import APIRouter

from app.core.config import settings
from app.services.vector_store_service import VectorStoreService

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/deps")
async def dependency_health() -> dict:
    vector_store = VectorStoreService()

    return {
        "status": "ok",
        "dependencies": {
            "groq": {
                "configured": bool(settings.groq_api_key),
                "model": settings.groq_model,
            },
            "gemini": {
                "configured": bool(settings.gemini_api_key),
                "embedding_model": settings.gemini_embedding_model,
            },
            "supabase": {
                "configured": bool(settings.supabase_url and settings.supabase_service_role_key),
                "enabled": vector_store.enabled,
            },
        },
    }
