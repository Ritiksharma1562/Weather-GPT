import asyncio
import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta
from uuid import uuid4
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from pwdlib import PasswordHash
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from .config import settings
from .database import get_db
from .models import RefreshSession, User, utcnow
from .schemas import GoogleLogin, Login, Signup
from .services.weather import aware

router = APIRouter(prefix="/auth", tags=["Authentication"])
bearer = HTTPBearer(auto_error=False)
password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash(secrets.token_urlsafe(24))


@dataclass
class Principal:
    id: str
    guest: bool = False


def token_for(user_id: str, guest: bool = False, family: str | None = None) -> str:
    now = utcnow()
    return jwt.encode(
        {
            "sub": user_id,
            "guest": guest,
            "family": family,
            "iat": now,
            "exp": now + timedelta(minutes=15),
            "iss": "weathergpt",
            "aud": "weathergpt-web",
            "jti": str(uuid4()),
            "type": "access",
        },
        settings.jwt_secret_key,
        algorithm="HS256",
    )


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=["HS256"],
            audience="weathergpt-web",
            issuer="weathergpt",
            options={"require": ["sub", "exp", "iat", "type"]},
        )
        if payload.get("type") != "access":
            raise ValueError("Wrong token type")
        return payload
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(401, "Session expired. Please sign in again.") from exc


async def authenticate(token: str, db: AsyncSession) -> Principal:
    payload = decode_token(token)
    if not payload.get("guest"):
        session = await db.scalar(
            select(RefreshSession).where(
                RefreshSession.user_id == payload["sub"],
                RefreshSession.family == payload.get("family"),
                RefreshSession.revoked.is_(False),
                RefreshSession.expires_at > utcnow(),
            )
        )
        if not session:
            raise HTTPException(401, "This session has ended")
    return Principal(payload["sub"], payload.get("guest", False))


async def principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Principal:

    # Allow guest access instead of 401
    if not credentials:
        return Principal(
            id="guest",
            email=None,
            display_name="Guest",
            guest=True,
        )

    return await authenticate(credentials.credentials, db)


async def member(user: Principal = Depends(principal)) -> Principal:
    if user.guest:
        raise HTTPException(403, "Create an account to save your data")
    return user


def public_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "avatar": user.avatar,
        "home_location": user.home_location,
        "guest": False,
    }


async def create_session(
    user: User, response: Response, db: AsyncSession, family: str | None = None
) -> dict:
    raw = secrets.token_urlsafe(48)
    family = family or str(uuid4())
    db.add(
        RefreshSession(
            user_id=user.id,
            token_hash=hashlib.sha256(raw.encode()).hexdigest(),
            family=family,
            expires_at=utcnow() + timedelta(days=30),
        )
    )
    await db.commit()
    response.set_cookie(
        "wg_refresh",
        raw,
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
        max_age=30 * 86400,
        path="/",
    )
    response.headers["Cache-Control"] = "no-store"
    return {
        "access_token": token_for(user.id, family=family),
        "token_type": "bearer",
        "expires_in": 900,
        "user": public_user(user),
    }


def same_origin(request: Request):
    if request.headers.get("origin") not in settings.origins:
        raise HTTPException(403, "A trusted frontend origin is required")


@router.post("/signup", status_code=201)
async def signup(data: Signup, response: Response, db: AsyncSession = Depends(get_db)):
    user = User(
        email=str(data.email).lower(),
        display_name=data.display_name,
        password_hash=await asyncio.to_thread(password_hash.hash, data.password),
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "An account with this email already exists")
    return await create_session(user, response, db)


@router.post("/login")
async def login(data: Login, response: Response, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == str(data.email).lower()))
    valid = await asyncio.to_thread(
        password_hash.verify,
        data.password,
        user.password_hash if user and user.password_hash else DUMMY_HASH,
    )
    if not user or not user.password_hash or not valid:
        raise HTTPException(401, "Incorrect email or password")
    return await create_session(user, response, db)


@router.post("/google")
async def google(
    data: GoogleLogin, response: Response, db: AsyncSession = Depends(get_db)
):
    if not settings.google_client_id:
        raise HTTPException(503, "Google sign-in is not configured")
    try:
        claims = await asyncio.to_thread(
            id_token.verify_oauth2_token,
            data.credential,
            GoogleRequest(),
            settings.google_client_id,
        )
    except Exception as exc:
        raise HTTPException(401, "Google sign-in could not be verified") from exc
    if not claims.get("email_verified"):
        raise HTTPException(401, "A verified Google email is required")
    user = await db.scalar(select(User).where(User.google_sub == claims["sub"]))
    if not user:
        existing = await db.scalar(
            select(User).where(User.email == claims["email"].lower())
        )
        if existing:
            raise HTTPException(
                409,
                "This email already uses password sign-in. Please use your password.",
            )
        user = User(
            email=claims["email"].lower(),
            display_name=claims.get("name", "Weather explorer")[:100],
            google_sub=claims["sub"],
            avatar=claims.get("picture"),
        )
        db.add(user)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(409, "Account already exists; please sign in again")
    return await create_session(user, response, db)


@router.post("/guest")
async def guest(response: Response):
    uid = str(uuid4())
    response.headers["Cache-Control"] = "no-store"
    return {
        "access_token": token_for(uid, True),
        "expires_in": 900,
        "user": {"id": uid, "guest": True, "display_name": "Guest explorer"},
    }


@router.post("/refresh")
async def refresh(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    same_origin(request)
    raw = request.cookies.get("wg_refresh", "")
    digest = hashlib.sha256(raw.encode()).hexdigest()
    stored = await db.scalar(
        select(RefreshSession).where(RefreshSession.token_hash == digest)
    )
    if not stored or aware(stored.expires_at) <= utcnow():
        raise HTTPException(401, "Please sign in")
    if stored.revoked:
        await db.execute(
            update(RefreshSession)
            .where(RefreshSession.family == stored.family)
            .values(revoked=True)
        )
        await db.commit()
        raise HTTPException(401, "Refresh token reuse detected; sign in again")
    claimed = await db.execute(
        update(RefreshSession)
        .where(RefreshSession.id == stored.id, RefreshSession.revoked.is_(False))
        .values(revoked=True)
        .returning(RefreshSession.id)
    )
    if not claimed.scalar_one_or_none():
        raise HTTPException(401, "Session already refreshed")
    user = await db.get(User, stored.user_id)
    if not user:
        raise HTTPException(401, "Account unavailable")
    return await create_session(user, response, db, stored.family)


@router.post("/logout")
async def logout(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    same_origin(request)
    digest = hashlib.sha256(request.cookies.get("wg_refresh", "").encode()).hexdigest()
    stored = await db.scalar(
        select(RefreshSession).where(RefreshSession.token_hash == digest)
    )
    if stored:
        await db.execute(
            update(RefreshSession)
            .where(RefreshSession.family == stored.family)
            .values(revoked=True)
        )
        await db.commit()
    response.delete_cookie("wg_refresh", path="/")
    return {"ok": True}
