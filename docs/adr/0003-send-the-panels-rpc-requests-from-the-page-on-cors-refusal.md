# Send the Panel's own RPC Requests from the inspected page when CORS refuses the Panel

The Panel's own RPC Requests to an Endpoint (`eth_chainId`, the EIP-1967 slot reads, the beacon `implementation()` call) are sent from the Panel first. When that fetch fails at the network level, as it does for a dApp's own RPC proxy whose CORS lets only its site in, the same request is sent again from the inspected page through `chrome.devtools.inspectedWindow.eval`, so it carries the page's origin. Host permissions would also get past CORS, but they bring the install warning 0001 and 0002 avoid; `inspectedWindow.eval` needs no permission at all.

## Consequences

The page-side request shows in the page's own Network tab and reaches `chrome.devtools.network`, so its JSON-RPC id carries the `evm-rpc-inspector:` prefix and the capture skips it. It is sent with the page's `fetch`, without cookies, so the page's own fetch wrappers see it. Only these same requests to the same Endpoint may go out from the page: do not run anything else there without revisiting this record and the privacy policy.
