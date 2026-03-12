from fastapi import APIRouter

from app.api.v1.endpoints.chat import router as chat_router
from app.api.v1.endpoints.events import router as events_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.repositories import router as repositories_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(repositories_router, prefix="/repos", tags=["repositories"])
api_router.include_router(events_router, prefix="/repos", tags=["events"])
api_router.include_router(chat_router, prefix="/chat", tags=["chat"])
