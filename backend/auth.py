import os

import jwt
from fastapi import Header, HTTPException
from jwt import PyJWKClient

# ---------------------------------------------------------------------------
# Clerk auth for the backend.
#
# The Next.js frontend attaches the signed-in user's Clerk session token as
# `Authorization: Bearer <token>` on every request. We verify that token here
# using Clerk's public JWKS (no secret key needed for verification) and pull
# the user's Clerk id out of the `sub` claim — that id is what every
# conversation, message, and setting in the database is scoped to.
#
# Get these two values from your Clerk dashboard -> Configure -> API Keys ->
# "Advanced" (or from `https://<your-domain>.clerk.accounts.dev/.well-known/jwks.json`
# directly): 
#
#   CLERK_JWKS_URL=https://<your-domain>.clerk.accounts.dev/.well-known/jwks.json
#   CLERK_ISSUER=https://<your-domain>.clerk.accounts.dev
#
# For a custom domain, both will use your own domain instead of
# *.clerk.accounts.dev — Clerk's dashboard shows the exact values either way.
# ---------------------------------------------------------------------------

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")
CLERK_ISSUER = os.getenv("CLERK_ISSUER")

_jwk_client = PyJWKClient(CLERK_JWKS_URL) if CLERK_JWKS_URL else None


def verify_clerk_token(token: str) -> str:
    """Verify a Clerk session JWT and return the Clerk user id (the `sub` claim)."""
    if not _jwk_client:
        raise RuntimeError(
            "Clerk auth isn't configured on the backend. Set CLERK_JWKS_URL and "
            "CLERK_ISSUER in your .env file."
        )

    signing_key = _jwk_client.get_signing_key_from_jwt(token)

    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=CLERK_ISSUER,
        # Clerk session tokens don't set a standard `aud` claim by default,
        # so we don't require one here. Issuer + signature are what prove
        # the token really came from your Clerk instance.
        options={"verify_aud": False},
    )

    return payload["sub"]


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """
    FastAPI dependency: pulls the Clerk session token out of the
    Authorization header, verifies it, and returns the caller's Clerk user
    id. Raises 401 if the header is missing or the token is invalid/expired.

    Usage: `user_id: str = Depends(get_current_user_id)` on any route that
    should only work for a signed-in user.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        return verify_clerk_token(token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please sign in again.")
