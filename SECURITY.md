# Security policy

## Secrets

Never commit API keys, bearer tokens, cookies, `.env` files, or captured media. Browser provider keys and the optional LDDC bearer belong only in `chrome.storage.local`. Server deployments use environment variables or the hosting platform's secret store.

## Browser boundaries

The browser extension requests custom provider origins only when a user saves an endpoint. Plain HTTP is accepted only for localhost, `.local`, RFC1918, link-local, or Tailscale CGNAT addresses. Model output is untrusted and must pass the local contract, grammar, timing, cost, and identity checks before takeover.

## Media boundaries

`tabCapture` is user-started and produces bounded in-memory features. Raw PCM, video, artwork bytes, cookies, and playable media URLs are not sent to the selected AI provider or stored by LyricStage.

## Reporting

Report a suspected vulnerability privately to the repository owner. Include the affected version, reproduction steps, and whether a key, browser permission, or deployment boundary is involved. Do not include live credentials in the report.
