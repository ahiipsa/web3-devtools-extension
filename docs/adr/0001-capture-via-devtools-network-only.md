# Capture RPC traffic via the DevTools network API only

RPC Requests are read from `chrome.devtools.network.onRequestFinished` inside the Panel, not from a background `webRequest` listener. A background listener needs `webRequest` plus `<all_urls>` host permissions, which triggers a "read and change all your data on all websites" install warning and heavier Chrome Web Store review, while the DevTools API already exposes request bodies and responses for the inspected tab with no permissions at all.

## Consequences

Traffic sent before the Panel is first shown is not captured: the Panel page only starts listening once the user opens the "EVM RPC" tab. The built-in Network tab has the same limitation for traffic sent before DevTools is opened. Do not reintroduce a background capture path without revisiting the permission cost.
