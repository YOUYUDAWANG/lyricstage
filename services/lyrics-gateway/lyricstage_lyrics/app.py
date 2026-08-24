from __future__ import annotations

import hmac
import logging
import os
from functools import lru_cache
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from . import SCHEMA
from .apple_music import AppleMusicError, AppleMusicProvider


logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("lyricstage-lyrics")


class ResolveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    schema_: Literal[SCHEMA] = Field(default=SCHEMA, alias="schema")
    request_id: str = Field(alias="requestID", min_length=1, max_length=180)
    title: str = Field(min_length=1, max_length=240)
    artists: list[str] = Field(min_length=1, max_length=8)
    aliases: list[str] = Field(default_factory=list, max_length=12)
    duration_milliseconds: int = Field(alias="durationMilliseconds", ge=1000, le=7_200_000)
    require_duration_match: bool = Field(default=True, alias="requireDurationMatch")
    max_candidates: int = Field(default=6, alias="maxCandidates", ge=1, le=12)


class ResolveResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    schema_: Literal[SCHEMA] = Field(default=SCHEMA, alias="schema")
    request_id: str = Field(alias="requestID")
    candidates: list[dict]


@lru_cache(maxsize=1)
def provider() -> AppleMusicProvider:
    return AppleMusicProvider(
        media_user_token=os.environ.get("APPLE_MUSIC_MEDIA_USER_TOKEN", ""),
        storefront=os.environ.get("APPLE_MUSIC_STOREFRONT"),
        translation_language=os.environ.get("APPLE_MUSIC_TRANSLATION_LANGUAGE", "zh-Hans-CN"),
        romanize=os.environ.get("APPLE_MUSIC_ROMANIZATION", "true").lower() == "true",
    )


def authorize(authorization: str | None = Header(default=None)) -> None:
    expected = os.environ.get("LYRICS_GATEWAY_TOKEN") or os.environ.get("LDDC_BACKEND_TOKEN", "")
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not expected or not hmac.compare_digest(expected, supplied):
        raise HTTPException(status_code=401, detail="unauthorized")


app = FastAPI(title="LyricStage lyrics gateway", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {
        "schema": SCHEMA,
        "status": "ok",
        "appleMusicConfigured": bool(os.environ.get("APPLE_MUSIC_MEDIA_USER_TOKEN", "").strip()),
        "primaryProvider": "applemusic",
    }


@app.post("/v1/lyrics/resolve", response_model=ResolveResponse, response_model_by_alias=True)
def resolve(request: ResolveRequest, _: None = Depends(authorize)) -> ResolveResponse:
    try:
        match = provider().lookup(request.title.strip(), [artist.strip() for artist in request.artists], request.duration_milliseconds)
    except AppleMusicError as error:
        logger.warning("Apple Music lookup unavailable: %s", error)
        return ResolveResponse(requestID=request.request_id, candidates=[])
    except Exception:
        logger.exception("Apple Music lookup failed")
        return ResolveResponse(requestID=request.request_id, candidates=[])
    if match is None:
        return ResolveResponse(requestID=request.request_id, candidates=[])
    lines = [
        {
            "startMilliseconds": line.start_ms,
            "endMilliseconds": line.end_ms,
            "text": line.text,
            "words": line.words,
        }
        for line in match.lines
    ]
    return ResolveResponse(
        requestID=request.request_id,
        candidates=[
            {
                "source": "applemusic",
                "id": match.song_id,
                "title": match.title,
                "artist": match.artist,
                "album": match.album,
                "durationSeconds": round(match.duration_ms / 1000),
                "timingKind": "word" if any(line.words for line in match.lines) else "line",
                "lyricLines": lines,
                "translationLines": [],
                "romanizationLines": [],
                "titleScore": 1.0,
                "artistScore": 1.0,
                "fromCache": False,
            }
        ],
    )
