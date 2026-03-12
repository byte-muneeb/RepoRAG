from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.main import app


def test_health() -> None:
    client = TestClient(app)
    response = client.get('/v1/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_dependency_health_shape() -> None:
    client = TestClient(app)
    response = client.get('/v1/health/deps')
    assert response.status_code == 200

    payload = response.json()
    assert payload['status'] == 'ok'
    assert 'dependencies' in payload

    deps = payload['dependencies']
    assert 'groq' in deps
    assert 'gemini' in deps
    assert 'supabase' in deps

    assert isinstance(deps['groq']['configured'], bool)
    assert isinstance(deps['groq']['model'], str)
    assert isinstance(deps['gemini']['configured'], bool)
    assert isinstance(deps['supabase']['configured'], bool)
    assert isinstance(deps['supabase']['enabled'], bool)
