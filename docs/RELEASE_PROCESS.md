# Release evidence

LyricStage keeps release truth executable. Do not copy test counts, bundle sizes or artifact hashes into hand-maintained status prose.

For a candidate commit:

```sh
npm ci
npm run ci
npm audit --audit-level=high
npm run verify:deterministic-extension
npm run test:browser-smoke
```

`npm run ci` owns coverage, type checking, every production build, the Director gateway, Manifest V3 checks, package/manifest version agreement, bundle budgets and a ratchet on the remaining large orchestration modules. `verify:deterministic-extension` rebuilds twice and compares the complete unpacked artifact byte-for-byte. The browser smoke uses a disposable Chromium profile and never reads the user's installed extension storage.

After automatic gates pass, mirror the reviewed artifact to the stable real unpacked path, reload only the original extension identity, refresh existing YouTube Music tabs and complete `docs/UAT_MATRIX.md`. Never copy provider keys, endpoints, lyrics or raw model responses into release evidence.
