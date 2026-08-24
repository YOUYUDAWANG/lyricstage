from lyricstage_lyrics.lrcmux import match_from_response


def test_builds_native_word_timing() -> None:
    match = match_from_response({
        "track": {"title": "Song", "artist": "Singer", "album": "Album", "duration": 10},
        "meta": {"source": {"id": "kugou"}, "level": "word"},
        "lines": [{
            "text": "hello world",
            "start": 1000,
            "end": 3000,
            "words": [
                {"text": "hello", "start": 1000, "end": 1900},
                {"text": "world", "start": 1900, "end": 3000},
            ],
        }],
    }, 10_000)
    assert match is not None
    assert match.lines[0].words[1]["text"] == "world"
    assert match.match_id.startswith("kugou:")


def test_derives_missing_line_and_word_ends() -> None:
    match = match_from_response({
        "track": {"title": "Song", "artist": "Singer", "duration": 10},
        "meta": {"source": {"id": "netease"}, "level": "word"},
        "lines": [
            {"text": "one two", "start": 1000, "words": [{"text": "one", "start": 1000}, {"text": "two", "start": 1800}]},
            {"text": "next", "start": 3000, "end": 5000},
        ],
    }, 10_000)
    assert match is not None
    assert match.lines[0].end_ms == 3000
    assert match.lines[0].words[0]["endMilliseconds"] == 1800
