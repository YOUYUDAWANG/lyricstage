# YouTube Music source

The current adapter is implemented across `packages/companion` and `apps/browser-extension`. YouTube Music remains authoritative for media identity, playback state, seek, pause, and track changes. The extension owns only its Shadow DOM surface and restores the native renderer when leaving Lyrics.

The portable provider contract and generic authority registry now live in `packages/companion/src/source.ts`. `youtubeMusicSourceAdapterV0` supplies YouTube Music validation while `YouTubeMusicSourceRegistryV0` remains the backwards-compatible bridge API used by the extension. Host DOM observation is still isolated in the extension content script; future DOM extraction must preserve the same adapter contract and multi-tab ownership tests.
