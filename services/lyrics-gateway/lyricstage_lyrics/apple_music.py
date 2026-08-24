from __future__ import annotations

import html
import json
import re
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode
from xml.etree import ElementTree

import httpx


BASE_URL = "https://amp-api.music.apple.com/v1"
STOREFRONT_URL = "https://api.music.apple.com/v1/me/storefront"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


class AppleMusicError(RuntimeError):
    pass


@dataclass(frozen=True)
class ParsedLine:
    start_ms: int
    end_ms: int
    text: str
    words: list[dict[str, Any]]


@dataclass(frozen=True)
class AppleMusicMatch:
    song_id: str
    title: str
    artist: str
    album: str | None
    duration_ms: int
    lines: list[ParsedLine]


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _parse_time(value: str | None) -> int | None:
    if not value:
        return None
    value = value.strip()
    if value.endswith("ms"):
        return round(float(value[:-2]))
    if value.endswith("s"):
        return round(float(value[:-1]) * 1000)
    parts = value.split(":")
    if len(parts) == 3:
        hours, minutes, seconds = parts
        return round((int(hours) * 3600 + int(minutes) * 60 + float(seconds)) * 1000)
    return None


def _node_text(node: ElementTree.Element) -> str:
    return html.unescape("".join(node.itertext())).strip()


def parse_apple_ttml(ttml: str) -> list[ParsedLine]:
    """Parse Apple Music line/word TTML into the extension's portable truth."""
    try:
        root = ElementTree.fromstring(ttml)
    except ElementTree.ParseError as error:
        raise AppleMusicError(f"invalid Apple Music TTML: {error}") from error

    lines: list[ParsedLine] = []
    for paragraph in (node for node in root.iter() if _local_name(node.tag) == "p"):
        start_ms = _parse_time(paragraph.attrib.get("begin"))
        end_ms = _parse_time(paragraph.attrib.get("end"))
        if start_ms is None or end_ms is None or end_ms <= start_ms:
            continue

        words: list[dict[str, Any]] = []
        for span in (node for node in paragraph.iter() if _local_name(node.tag) == "span"):
            word_start = _parse_time(span.attrib.get("begin"))
            word_end = _parse_time(span.attrib.get("end"))
            text = _node_text(span)
            if (
                word_start is not None
                and word_end is not None
                and start_ms <= word_start < word_end <= end_ms
                and text
            ):
                words.append(
                    {
                        "startMilliseconds": word_start,
                        "endMilliseconds": word_end,
                        "text": text,
                    }
                )

        text = _node_text(paragraph)
        if not text:
            continue
        lines.append(ParsedLine(start_ms, end_ms, text, words))

    lines.sort(key=lambda line: line.start_ms)
    return [line for index, line in enumerate(lines) if index == 0 or line.start_ms >= lines[index - 1].start_ms]


class AppleMusicProvider:
    def __init__(
        self,
        media_user_token: str,
        storefront: str | None = None,
        translation_language: str | None = "zh-Hans-CN",
        romanize: bool = True,
    ) -> None:
        self._media_user_token = media_user_token.strip()
        self._configured_storefront = storefront.strip() if storefront else None
        self._translation_language = translation_language
        self._romanize = romanize
        self._developer_token: tuple[str, float] | None = None
        self._resolved_storefront: tuple[str, float] | None = None
        self._client = httpx.Client(timeout=15, follow_redirects=True, headers={"User-Agent": USER_AGENT})

    def close(self) -> None:
        self._client.close()

    def _developer_token_value(self, force: bool = False) -> str:
        if not force and self._developer_token and self._developer_token[1] > time.time():
            return self._developer_token[0]
        home = self._client.get("https://music.apple.com/")
        home.raise_for_status()
        script_match = re.search(r'<script type="module" crossorigin src="(/assets/index[^\"]+\.js)"', home.text)
        if not script_match:
            raise AppleMusicError("could not find Apple Music index script")
        script = self._client.get(f"https://music.apple.com{script_match.group(1)}")
        script.raise_for_status()
        variable_match = re.search(r"\.headers\.Authorization\s*=\s*`Bearer \$\{([A-Za-z0-9_$]+)\}`", script.text)
        if not variable_match:
            raise AppleMusicError("could not find Apple Music developer token variable")
        token_match = re.search(
            rf'{re.escape(variable_match.group(1))}\s*=\s*"(eyJ[A-Za-z0-9._-]+)"',
            script.text,
        )
        if not token_match:
            raise AppleMusicError("could not find Apple Music developer token")
        token = token_match.group(1)
        self._developer_token = (token, time.time() + 7 * 24 * 3600)
        return token

    def _headers(self, developer_token: str) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {developer_token}",
            "media-user-token": self._media_user_token,
            "Origin": "https://music.apple.com",
            "Referer": "https://music.apple.com",
            "User-Agent": USER_AGENT,
        }

    def _storefront(self, developer_token: str) -> str:
        if self._configured_storefront:
            return self._configured_storefront
        if self._resolved_storefront and self._resolved_storefront[1] > time.time():
            return self._resolved_storefront[0]
        response = self._client.get(STOREFRONT_URL, headers=self._headers(developer_token))
        if response.status_code in (401, 403):
            raise AppleMusicError("Apple Music subscription token was rejected")
        storefront = "us"
        if response.status_code == 200:
            data = response.json().get("data", [])
            if data and isinstance(data[0].get("id"), str):
                storefront = data[0]["id"]
        self._resolved_storefront = (storefront, time.time() + 30 * 24 * 3600)
        return storefront

    def lookup(self, title: str, artists: list[str], duration_ms: int) -> AppleMusicMatch | None:
        if not self._media_user_token:
            raise AppleMusicError("Apple Music media-user-token is not configured")
        developer_token = self._developer_token_value()
        try:
            return self._lookup(developer_token, title, artists, duration_ms)
        except AppleMusicError as error:
            if "rejected" not in str(error):
                raise
            return self._lookup(self._developer_token_value(force=True), title, artists, duration_ms)

    def _lookup(self, developer_token: str, title: str, artists: list[str], duration_ms: int) -> AppleMusicMatch | None:
        storefront = self._storefront(developer_token)
        query = " ".join([title, artists[0] if artists else ""]).strip()
        response = self._client.get(
            f"{BASE_URL}/catalog/{storefront}/search",
            params={"types": "songs", "term": query},
            headers=self._headers(developer_token),
        )
        if response.status_code in (401, 403):
            raise AppleMusicError("Apple Music developer token was rejected")
        response.raise_for_status()
        songs = response.json().get("results", {}).get("songs", {}).get("data", [])
        candidates = []
        for song in songs:
            attributes = song.get("attributes", {})
            candidate_duration = attributes.get("durationInMillis")
            if not isinstance(candidate_duration, int) or attributes.get("hasLyrics") is False:
                continue
            candidates.append((abs(candidate_duration - duration_ms), song))
        if not candidates:
            return None
        difference, song = min(candidates, key=lambda candidate: candidate[0])
        if difference > 3000:
            return None

        attributes = song["attributes"]
        params: list[tuple[str, str]] = [("extend", "ttmlLocalizations")]
        if self._translation_language:
            params.append(("l[lyrics]", self._translation_language))
        if self._romanize:
            params.append(("l[script]", "und-Latn"))
        lyrics = self._client.get(
            f"{BASE_URL}/catalog/{storefront}/songs/{song['id']}/syllable-lyrics?{urlencode(params)}",
            headers=self._headers(developer_token),
        )
        if lyrics.status_code == 404:
            return None
        if lyrics.status_code in (401, 403):
            raise AppleMusicError("Apple Music developer token was rejected")
        lyrics.raise_for_status()
        entries = lyrics.json().get("data", [])
        if not entries:
            return None
        lyric_attributes = entries[0].get("attributes", {})
        ttml = lyric_attributes.get("ttmlLocalizations") or lyric_attributes.get("ttml")
        if not isinstance(ttml, str) or not ttml.strip():
            return None
        lines = parse_apple_ttml(ttml)
        if not lines:
            return None
        return AppleMusicMatch(
            song_id=str(song["id"]),
            title=str(attributes.get("name") or title),
            artist=str(attributes.get("artistName") or (artists[0] if artists else "Apple Music")),
            album=str(attributes.get("albumName")) if attributes.get("albumName") else None,
            duration_ms=int(attributes["durationInMillis"]),
            lines=lines,
        )
