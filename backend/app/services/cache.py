import asyncio
import json
import time
from collections import OrderedDict
from redis.asyncio import Redis
from ..config import settings


class Cache:
    def __init__(self):
        self.redis = (
            Redis.from_url(settings.redis_url, decode_responses=True)
            if settings.redis_url
            else None
        )
        self.memory: OrderedDict[str, tuple[float, object]] = OrderedDict()
        self.lock = asyncio.Lock()

    async def get(self, key: str):
        if self.redis:
            raw = await self.redis.get("wg:" + key)
            return json.loads(raw) if raw else None
        entry = self.memory.get(key)
        if entry and entry[0] > time.monotonic():
            self.memory.move_to_end(key)
            return entry[1]
        self.memory.pop(key, None)
        return None

    async def set(self, key: str, value, ttl: int = 300):
        if self.redis:
            await self.redis.set("wg:" + key, json.dumps(value), ex=ttl)
            return
        self.memory[key] = (time.monotonic() + ttl, value)
        self.memory.move_to_end(key)
        while len(self.memory) > 1024:
            self.memory.popitem(last=False)

    async def limit(self, key: str, maximum: int, period: int) -> bool:
        if self.redis:
            value = await self.redis.eval(
                "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
                1,
                "wg:limit:" + key,
                period,
            )
            return value <= maximum
        async with self.lock:
            bucket = f"limit:{key}:{int(time.time()) // period}"
            count = (await self.get(bucket) or 0) + 1
            await self.set(bucket, count, period)
            return count <= maximum

    async def close(self):
        if self.redis:
            await self.redis.aclose()


cache = Cache()



