# YouTube Music source

The current adapter is implemented across `packages/companion` and `apps/browser-extension`. YouTube Music remains authoritative for media identity, playback state, seek, pause, and track changes. The extension owns only its Shadow DOM surface and restores the native renderer when leaving Lyrics.

This directory documents the provider boundary while the implementation remains colocated with the Companion runtime. A future extraction must preserve the existing contracts and multi-tab ownership tests.
