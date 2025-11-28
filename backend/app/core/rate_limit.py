from datetime import datetime, timedelta
from typing import Optional
import redis
import json

from app.core.config import get_settings


class RateLimiter:
    """IP 限流器"""

    def __init__(self, redis_client: redis.Redis = None):
        settings = get_settings()
        if redis_client is None:
            self.redis = redis.from_url(settings.redis_url)
        else:
            self.redis = redis_client
        self.max_requests = settings.rate_limit_requests
        self.window_seconds = settings.rate_limit_window_seconds

    def _get_key(self, client_ip: str) -> str:
        """取得 Redis key"""
        return f"rate_limit:{client_ip}"

    def check_rate_limit(self, client_ip: str) -> tuple[bool, int]:
        """
        檢查是否超過限流

        Returns:
            tuple: (是否允許請求, 剩餘請求數)
        """
        key = self._get_key(client_ip)
        now = datetime.utcnow()

        # Get current window data
        data = self.redis.get(key)

        if data is None:
            # First request in window
            window_data = {
                "count": 1,
                "window_start": now.isoformat()
            }
            self.redis.setex(
                key,
                self.window_seconds,
                json.dumps(window_data)
            )
            return True, self.max_requests - 1

        window_data = json.loads(data)
        window_start = datetime.fromisoformat(window_data["window_start"])
        count = window_data["count"]

        # Check if window has expired
        if now - window_start > timedelta(seconds=self.window_seconds):
            # Reset window
            window_data = {
                "count": 1,
                "window_start": now.isoformat()
            }
            self.redis.setex(
                key,
                self.window_seconds,
                json.dumps(window_data)
            )
            return True, self.max_requests - 1

        # Check if limit exceeded
        if count >= self.max_requests:
            return False, 0

        # Increment counter
        window_data["count"] = count + 1
        ttl = self.redis.ttl(key)
        if ttl > 0:
            self.redis.setex(key, ttl, json.dumps(window_data))

        return True, self.max_requests - count - 1

    def get_remaining_requests(self, client_ip: str) -> int:
        """取得剩餘請求數"""
        key = self._get_key(client_ip)
        data = self.redis.get(key)

        if data is None:
            return self.max_requests

        window_data = json.loads(data)
        window_start = datetime.fromisoformat(window_data["window_start"])
        now = datetime.utcnow()

        if now - window_start > timedelta(seconds=self.window_seconds):
            return self.max_requests

        return max(0, self.max_requests - window_data["count"])

    def get_reset_time(self, client_ip: str) -> Optional[int]:
        """取得限流重置時間（秒）"""
        key = self._get_key(client_ip)
        ttl = self.redis.ttl(key)
        return ttl if ttl > 0 else None


class RateLimitExceeded(Exception):
    """頻率限制超過例外"""
    pass


# Global instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """取得限流器實例"""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


def check_rate_limit(client_ip: str) -> None:
    """
    檢查頻率限制

    Args:
        client_ip: 客戶端 IP

    Raises:
        RateLimitExceeded: 當超過頻率限制時
    """
    limiter = get_rate_limiter()
    allowed, remaining = limiter.check_rate_limit(client_ip)
    if not allowed:
        reset_time = limiter.get_reset_time(client_ip)
        raise RateLimitExceeded(f"請求次數超過限制，請於 {reset_time} 秒後再試")
