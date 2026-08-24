from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

import httpx

from .apple_music import ParsedLine


DEFAULT_BASE_URL = "https://api.lrcmux.dev"


@dataclass(frozen=True)
class LrcMuxMatch:
    match_id: str
    title: str
    artist: str
    album: str | None
    duration_ms: int
    lines: list[ParsedLine]


def match_from_response(value: dict[str, Any], fallback_duration_ms: int) -> LrcMuxMatch | None:
    track = value.get("track") if isinstance(value.get("track"), dict) else {}
    raw_lines = value.get("lines") if isinstance(value.get("lines"), list) else []
    duration_seconds = track.get("duration")
    duration_ms = round(float(duration_seconds) * 1000) if isinstance(duration_seconds, (int, float)) else fallback_duration_ms
    parsed: list[ParsedLine] = []
    for index, raw in enumerate(raw_lines):
        if not isinstance(raw, dict) or not isinstance(raw.get("text"), str):
            continue
        start = raw.get("start")
        if not isinstance(start, (int, float)) or start < 0:
            continue
        following_start = next((
            following.get("start")
            for following in raw_lines[index + 1:]
            if isinstance(following, dict) and isinstance(following.get("start"), (int, float))
        ), None)
        raw_end = raw.get("end")
        end = raw_end if isinstance(raw_end, (int, float)) else following_start
        if not isinstance(end, (int, float)) or end <= start:
            end = min(duration_ms, round(start) + 4000)
        if end <= start:
            continue
        words: list[dict[str, Any]] = []
        for word_index, word in enumerate(raw.get("words") if isinstance(raw.get("words"), list) else []):
            if not isinstance(word, dict) or not isinstance(word.get("text"), str):
                continue
            word_start = word.get("start")
            word_end = word.get("end")
            if not isinstance(word_start, (int, float)):
                continue
            if not isinstance(word_end, (int, float)):
                next_word = raw["words"][word_index + 1] if word_index + 1 < len(raw["words"]) else None
                word_end = next_word.get("start") if isinstance(next_word, dict) else end
            if isinstance(word_end, (int, float)) and word["text"] and start <= word_start < word_end <= end:
                words.append({
                    "startMilliseconds": round(word_start),
                    "endMilliseconds": round(word_end),
                    "text": word["text"],
                })
        text = raw["text"].strip()
        if text:
            parsed.append(ParsedLine(round(start), round(end), text, words))
    if not parsed:
        return None
    title = str(track.get("title") or "").strip()
    artist = str(track.get("artist") or "").strip()
    if not title or not artist:
        return None
    source = value.get("meta", {}).get("source", {}) if isinstance(value.get("meta"), dict) else {}
    identity = "\0".join([str(source.get("id") or "unknown"), title, artist, str(duration_ms)])
    match_id = f"{source.get('id') or 'mux'}:{hashlib.sha256(identity.encode()).hexdigest()[:24]}"
    album = str(track.get("album") or "").strip() or None
    return LrcMuxMatch(match_id, title, artist, album, duration_ms, parsed)


class LrcMuxProvider:
    def __init__(self, base_url: str = DEFAULT_BASE_URL) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.Client(timeout=15, follow_redirects=True)

    def lookup(self, title: str, artists: list[str], duration_ms: int) -> LrcMuxMatch | None:
        response = self._client.get(
            f"{self._base_url}/get",
            params={
                "artist": artists[0] if artists else "",
                "title": title,
                "album": "",
                "duration": str(round(duration_ms / 1000)),
            },
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return match_from_response(response.json(), duration_ms)
