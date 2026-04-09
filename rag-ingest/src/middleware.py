from fastapi import FastAPI, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse
import jwt
import requests
from jwt import PyJWKClient
import logging
import os

# Auth0 configuration
AUTH0_DOMAIN = "dev-w5iil6bapqnf2nai.us.auth0.com"
AUTH0_AUDIENCE = "urn:labthingy:api"

LAB_THINGY_JWT_SECRET = os.environ.get('LAB_THINGY_JWT_SECRET')

class TokenValidationMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.jwks_client = PyJWKClient(f"https://{AUTH0_DOMAIN}/.well-known/jwks.json")
        # Ensure the shared secret is present for HS256 tokens
        self.custom_secret = os.environ.get('LAB_THINGY_JWT_SECRET')
        if not self.custom_secret:
            logging.getLogger(__name__).error("LAB_THINGY_JWT_SECRET is not set in environment for labs service.")
            # Fail fast to make misconfiguration obvious
            raise RuntimeError("LAB_THINGY_JWT_SECRET is required for HS256 token validation")

    async def dispatch(self, request: Request, call_next):
        # Allow health and metrics without auth
        if request.url.path in ('/healthz', '/metrics'):
            return await call_next(request)

        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token:
            # if no token, check to see if it's a sign up request
            if request.url.path == '/orgs/org' and request.method == 'POST':
                return await call_next(request)

            if request.url.path == '/orgs/check-availability' and request.method == 'POST':
                return await call_next(request)
            # if no token and not a sign up request, return 400
            return JSONResponse(
                content={'detail': 'Authorization header missing'},
                status_code=400
            )

        payload = None

        # Detect algorithm from JWT header to choose validator
        alg = None
        try:
            unverified_header = jwt.get_unverified_header(token)
            alg = unverified_header.get('alg')
        except Exception:
            # If header can't be parsed, proceed with existing strategy and error out if needed
            pass

        try:
            if alg == "HS256":
                # Custom token signed with shared secret
                payload = self._validate_custom_token(token)
            else:
                # Try Auth0 RS256 first; if that fails, fall back to HS256
                try:
                    payload = self._validate_auth0_token(token)
                except Exception as auth0_error:
                    print(f"Auth0 validation failed: {auth0_error}")
                    payload = self._validate_custom_token(token)
        except Exception as custom_error:
            print(f"Custom token validation failed: {custom_error}")
            return JSONResponse(
                content={'detail': 'Invalid token'},
                status_code=403
            )

        if not payload:
            return JSONResponse(
                content={'detail': 'Token validation failed'},
                status_code=403
            )

        # Extract common claims
        org_id = payload.get("org_id")
        user_id = payload.get("user_id")
        lab_id = payload.get("lab_id")
        
        # For Auth0 tokens, org_id might be in a different claim
        if not org_id:
            org_id = payload.get("https://labthingy.com/org_id") or payload.get("org")

        print(f"Extracted claims - org_id: {org_id}, user_id: {user_id}, lab_id: {lab_id}")

        # Attach to request state for downstream use
        request.state.user_info = {
            "org_id": org_id,
            "user_id": user_id,
            "lab_id": lab_id,
            "token_type": "auth0" if "iss" in payload and AUTH0_DOMAIN in payload["iss"] else "custom"
        }

        response = await call_next(request)
        return response

    def _validate_auth0_token(self, token):
        """Validate Auth0 JWT token"""
        signing_key = self.jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=AUTH0_AUDIENCE,
            issuer=f"https://{AUTH0_DOMAIN}/"
        )
        return payload

    def _validate_custom_token(self, token):
        """Validate custom JWT token using shared secret"""
        return jwt.decode(token, self.custom_secret, algorithms=["HS256"])
