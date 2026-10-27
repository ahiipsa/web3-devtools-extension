---
name: run-evm-rpc-inspector
description: Build, run and drive the EVM RPC Inspector DevTools extension in real DevTools. Use when asked to run, start, load, smoke-test, screenshot or click through the extension or its Panel, or to check that a change works in DevTools rather than only in unit tests.
---

The extension is driven by `.claude/skills/run-evm-rpc-inspector/driver.mjs`. It loads `build/` into Playwright's Chromium with DevTools open on a local dApp page, switches DevTools to the EVM RPC Panel and controls both over CDP: real clicks, real key presses, screenshots of the DevTools window. The dApp sends real JSON-RPC over HTTP to a mock node inside the driver, so the Panel captures it through `chrome.devtools.network` exactly as in the field.

All paths are relative to the repo root. Verified on macOS (Darwin 25, Node 22); the window is real but off screen.

## Setup

```bash
npm ci
npx playwright-core install chromium   # once per machine, ~150 MB into ~/Library/Caches/ms-playwright
```

`playwright-core` is a pinned dev dependency (1.48.2); its Chromium is the one that loads unpacked extensions.

## Build

```bash
npm run build    # typecheck + build into build/; the driver loads build/, so rebuild after every change
```

## Run (agent path)

Full scenario, one line per check, exit code 1 on any FAIL:

```bash
node .claude/skills/run-evm-rpc-inspector/driver.mjs smoke
```

It covers capture (single, batch, non-RPC POST skipped), the details, adding a Contract and Decoding with named arguments and return values, keyboard navigation (Esc, Enter, arrows, Home/End, ⌘+F), the toolbar at side-docked width, deleting the Contract, the list clearing on reload, a legacy Contract in storage, and fetching ABIs from Sourcify (404 state, `<name> / <function>` without touching the Contract tab, "From Sourcify", the Panel's own `eth_chainId` to an Endpoint, no Etherscan request without a key; with a key typed into the settings, Etherscan after a Sourcify 404, "From Etherscan", the miss on both, the key nowhere in the DOM outside its field; the setting off). Screenshots go to `$OUT` (default `$TMPDIR/evm-rpc-inspector-shots`); look at them.

Ad hoc, for whatever the change touches, pipe line commands into the REPL:

```bash
printf '%s\n' traffic 'click .rpc-table-body [role=row]:nth-child(2)' selected 'key ArrowDown' selected \
  'click .rpc-details-tab @ Params' 'key f meta' 'eval document.activeElement.getAttribute("aria-label")' \
  'rpc {"jsonrpc":"2.0","id":9,"method":"eth_chainId"}' rows drawer errors 'ss repl' quit \
  | node .claude/skills/run-evm-rpc-inspector/driver.mjs repl
```

| Command                                               | Does                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `traffic`                                             | sends the standard traffic (five RPC Requests, see `TRAFFIC` in the driver)       |
| `rpc <json>`                                          | sends one request body from the dApp page, prints the node's response             |
| `click <selector> [@ text]`                           | real mouse click on the first match in the Panel (text = innerText or aria-label) |
| `key <key> [meta ctrl alt shift]`                     | real key press to whatever has focus, e.g. `key Escape`, `key f meta`             |
| `type <text>`                                         | inserts text into the focused field                                               |
| `eval <js>` / `devtools <js>`                         | evaluates in the Panel / in the DevTools frontend, prints JSON                    |
| `rows`, `selected`, `drawer`, `closedrawer`, `errors` | table rows, selected row, DevTools drawer open?, close it, Panel exceptions       |
| `ss <name>`                                           | screenshot of the DevTools window to `$OUT/<name>.png`                            |

**Sourcify and Etherscan are never hit.** `launch()` enables CDP `Fetch` on the Panel target for `https://sourcify.dev/*` and `https://api.etherscan.io/*`. Sourcify answers from `SOURCIFY` in the driver: a 200 with an ABI and `compilation.name` (`WETH9`) for `WETH`, a 404 for any other address. Etherscan answers from `ETHERSCAN`: `LinkToken` for `LINK`, "Contract source code not verified" for any other address. `app.sourcifyUrls` and `app.etherscanUrls` list the URLs the Panel asked for, in order (the Etherscan ones carry the key). The mock node answers with open CORS and logs every RPC Request it gets in `app.nodeLog` (`{ origin, path, method }`); the Panel's own `eth_chainId` has a `chrome-extension://` origin. `app.rpc(body, "/rpc2")` sends to another path, i.e. another Endpoint whose chain id the Panel has not captured. In the REPL, `eval` the storage or `click .rpc-table-settings-button` for the settings.

The mock node's answers are `ANSWERS` in the driver (`eth_call` returns 1000000, `eth_estimateGas` reverts). To exercise another build: `EXT=/path/to/build node .claude/skills/run-evm-rpc-inspector/driver.mjs smoke`. `HEADED=1` puts the window on screen. DevTools follow the system colour scheme; `LIGHT=1` forces the light theme (`themeName` `default`).

## Run (human path)

`npm run build`, then `chrome://extensions` → Developer mode → Load unpacked → `build/`, open DevTools on any dApp, tab **EVM RPC**. Reload the extension after each rebuild.

## Test

```bash
npm test && npm run lint
```

## Gotchas

- **Branded Google Chrome ignores `--load-extension`**, so `channel: "chrome"` cannot load the extension. Use Playwright's own Chromium (the driver's default).
- **DevTools never open in headless mode**, neither old nor new headless: no `devtools://` target appears. The driver runs headed with `--window-position=-3000,-3000`. On Linux, wrap it in `xvfb-run` (not verified here).
- **Opening the Panel**: DevTools has no CDP command for it. The driver evaluates `InspectorView.instance().showPanel(id)` from `./ui/legacy/legacy.js` inside the DevTools frontend. The Panel id is `chrome-extension://<id>EVMRPC`, with no space.
- **The Panel is its own CDP target** (`iframe`, `chrome-extension://<id>/index.html`). Evaluate there, but send input to the DevTools page target. Panel coordinates are offset by the DevTools tab strip; the driver computes the offset from both `innerWidth`/`innerHeight`.
- **DevTools injects `forwardKeyboardEvent` into the Panel.** It is a keydown listener on `document` in the bubble phase that `preventDefault()`s Esc and Ctrl/⌘ shortcuts and forwards them to DevTools (Esc toggles the drawer, ⌘+F opens DevTools search). A Panel shortcut must listen on `window` in the capture phase and stop propagation (`src/utils/panelShortcut.ts`). A stubbed `chrome.devtools` cannot show this, which is why this driver exists.
- **Synthetic `dispatchEvent` keys are not enough** for keyboard checks: they skip the DevTools forwarding path. Use `key`, which goes through `Input.dispatchKeyEvent`.
- **When the DevTools drawer opens, it takes focus**, and every later key misses the Panel. If a key check fails, check `drawer` first.
- **A search that hides the selected RPC Request closes the details.** Reopen with a click or Enter before checking details. Only Esc and ✕ close them otherwise; a click always opens them.
- **The Panel receives entries asynchronously**: `rpc` and `traffic` wait a little before returning.

## Troubleshooting

| Symptom                                          | Fix                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `no CDP target matching … devtools_app`          | running headless; the driver must stay `headless: false`                                               |
| `EVM RPC Panel not registered: is build/ built?` | `npm run build`, or point `EXT` at a built folder                                                      |
| `nothing to click: <selector>`                   | the element isn't rendered (details closed, wrong tab); `ss` and look                                  |
| Key checks fail one after another                | the DevTools drawer stole focus: `drawer` prints `true`; `closedrawer`, then click back into the Panel |
