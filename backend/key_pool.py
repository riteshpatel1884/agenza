"""
Generic multi-key rotation with cooldown.

Every provider in this app (Groq, Gemini, Mistral, Tavily) can be given more
than one API key in .env — e.g.:

    GROQ_API_KEY_1=gsk_...
    GROQ_API_KEY_2=gsk_...
    GROQ_API_KEY_3=gsk_...

A `KeyPool` holds all the keys for one provider. When a key comes back
rate-limited (HTTP 429 / "quota" / "resource exhausted" / etc.), the caller
tells the pool via `mark_limited(key)`, which puts that key on a cooldown
timer. The next call to `ordered_keys()` puts still-available keys first, so
the very next request automatically picks a different key — no user-visible
interruption, and no need to wait for a human to swap keys in the dashboard.

This is intentionally provider-agnostic: the same class backs LLM fallback
(agent.py's FallbackChatModel) and the Tavily web-search tool.
"""

import itertools
import time

# Substrings that show up across providers' rate-limit / quota errors.
# Matching is deliberately loose (case-insensitive substring match) since
# every SDK wraps its HTTP errors differently.
_RATE_LIMIT_MARKERS = (
    "429",
    "rate limit",
    "rate_limit",
    "ratelimit",
    "quota",
    "resource_exhausted",
    "resourceexhausted",
    "too many requests",
    "capacity",
)


def looks_like_rate_limit(exc: Exception) -> bool:
    """Best-effort check for whether an exception is a rate limit / quota error."""
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status in (429,):
        return True
    text = f"{type(exc).__name__} {exc}".lower()
    return any(marker in text for marker in _RATE_LIMIT_MARKERS)


class KeyPool:
    """Round-robins a list of API keys for one provider, skipping cooldowns."""

    def __init__(self, keys: list[str], cooldown_seconds: int = 90):
        # De-dupe while preserving declared order (env var order matters —
        # it's the priority order when nothing is on cooldown).
        seen = set()
        self._keys = []
        for k in keys:
            k = (k or "").strip()
            if k and k not in seen:
                seen.add(k)
                self._keys.append(k)

        self._cooldown_seconds = cooldown_seconds
        self._available_at = {k: 0.0 for k in self._keys}

    def __bool__(self) -> bool:
        return bool(self._keys)

    def __len__(self) -> int:
        return len(self._keys)

    def all_keys(self) -> list[str]:
        """Keys in their original declared (.env) order."""
        return list(self._keys)

    def available_at(self, key: str) -> float:
        return self._available_at.get(key, 0.0)

    def ordered_keys(self) -> list[str]:
        """
        Keys ready to use right now (in declared order) first, followed by
        keys still cooling down (soonest-available first). Always returns
        every key eventually, so a request never hard-fails just because
        every key looked rate-limited a minute ago.
        """
        now = time.time()
        ready = [k for k in self._keys if self._available_at[k] <= now]
        cooling = sorted(
            (k for k in self._keys if self._available_at[k] > now),
            key=lambda k: self._available_at[k],
        )
        return ready + cooling

    def mark_limited(self, key: str):
        """Put a key on cooldown after it comes back rate-limited."""
        if key in self._available_at:
            self._available_at[key] = time.time() + self._cooldown_seconds