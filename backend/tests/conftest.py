"""
Pytest configuration and fixtures for backend tests.
"""
import os
import tempfile
import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport


# 設定測試環境變數，使用臨時目錄
@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """設定測試環境，使用臨時目錄代替 /data"""
    with tempfile.TemporaryDirectory() as tmpdir:
        os.environ["UPLOADS_DIR"] = os.path.join(tmpdir, "uploads")
        os.environ["RESULTS_DIR"] = os.path.join(tmpdir, "results")
        os.makedirs(os.environ["UPLOADS_DIR"], exist_ok=True)
        os.makedirs(os.environ["RESULTS_DIR"], exist_ok=True)

        # 清除設定快取，確保使用新的環境變數
        from app.core.config import get_settings
        get_settings.cache_clear()

        # 重置單例，確保使用新的設定
        from app.services import local_storage
        local_storage._storage = None

        yield

        # 清理
        local_storage._storage = None
        get_settings.cache_clear()


@pytest.fixture
def client(setup_test_environment):
    """Synchronous test client for FastAPI app."""
    from app.main import app
    return TestClient(app)


@pytest.fixture
async def async_client(setup_test_environment):
    """Asynchronous test client for FastAPI app."""
    from app.main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
