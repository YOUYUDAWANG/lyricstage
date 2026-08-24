# LyricStage lyrics gateway

Optional, self-hosted Apple Music lyrics gateway for the browser extension. It
keeps the extension functional without private configuration; LRCLIB and Kugou
remain local fallbacks.

The Apple Music lookup flow intentionally follows the MIT-licensed
[`nd-lyrics`](https://github.com/J0R6IT0/navidrome-lyrics-plugin) provider:
catalog search, duration validation, and syllable-TTML retrieval. `nd-lyrics`
itself remains installed in Navidrome for library playback, while this small
HTTP adapter accepts the portable metadata available from YouTube Music.
When Apple Music has no duration-safe result, the adapter falls back to
`lrcmux`, which aggregates additional established providers. The extension
then retains its direct LRCLIB and Kugou fallbacks.

Required environment variables:

- `LYRICS_GATEWAY_TOKEN`: bearer token accepted from the extension.
- `APPLE_MUSIC_MEDIA_USER_TOKEN`: Apple Music subscription token.

Optional:

- `APPLE_MUSIC_STOREFRONT`: overrides automatic storefront resolution.
- `APPLE_MUSIC_TRANSLATION_LANGUAGE`: defaults to `zh-Hans-CN`.
- `APPLE_MUSIC_ROMANIZATION`: defaults to `true`.

No credential belongs in this directory or in the container image.
