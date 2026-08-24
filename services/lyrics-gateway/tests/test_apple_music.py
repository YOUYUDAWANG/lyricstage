from lyricstage_lyrics.apple_music import parse_apple_ttml


def test_parse_word_timed_ttml() -> None:
    lines = parse_apple_ttml(
        '''<tt xmlns="http://www.w3.org/ns/ttml"><body><div>
        <p begin="00:00:01.000" end="00:00:03.000"><span begin="00:00:01.000" end="00:00:01.800">I'll</span> <span begin="00:00:01.800" end="00:00:03.000">be there</span></p>
        </div></body></tt>'''
    )
    assert len(lines) == 1
    assert lines[0].text == "I'll be there"
    assert [word["text"] for word in lines[0].words] == ["I'll", "be there"]
    assert lines[0].words[1]["startMilliseconds"] == 1800


def test_parse_line_timed_ttml() -> None:
    lines = parse_apple_ttml(
        '<tt xmlns="http://www.w3.org/ns/ttml"><body><p begin="1.5s" end="3s">命に嫌われている</p></body></tt>'
    )
    assert lines[0].start_ms == 1500
    assert lines[0].end_ms == 3000
    assert lines[0].words == []
