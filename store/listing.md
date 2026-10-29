# Chrome Web Store listing

What to enter in the Chrome Web Store developer dashboard for EVM RPC Inspector. Upload `release/evm-rpc-inspector-<version>.zip` from `npm run release`.

## Store listing

**Title** (from the manifest): EVM RPC Inspector

**Summary** (from the manifest, at most 132 characters): Inspect and decode EVM JSON-RPC calls in Chrome DevTools

**Category**: Developer Tools

**Language**: English

**Description** (plain text, paste as is):

```text
EVM RPC Inspector adds an "EVM RPC" tab to Chrome DevTools that shows the JSON-RPC traffic of the dApp you are debugging, decoded.

Where the Network tab shows a wall of POST requests to the same RPC endpoint, EVM RPC Inspector lists each JSON-RPC call on its own row, one per entry of a batch, with its method, chain, contract, function, status, endpoint and time.

FEATURES
• Decodes eth_call, eth_estimateGas and eth_sendTransaction into the function name, named arguments and decoded return values.
• Fetches verified ABIs from Sourcify automatically, and from Etherscan with your own API key. Proxies (EIP-1967 and those Sourcify resolves) decode with their implementation's ABI.
• Opens up Multicall3 and Multicall2: every inner call with its target contract, function, arguments and result.
• Decodes reverts: Error(string), Panic codes and custom errors, including errors bubbled up from other known contracts.
• Shows the chain by name, and links addresses, transactions and blocks to the chain's explorer, such as Etherscan.
• Add your own ABI: a JSON array, a Hardhat or Foundry artifact, an Etherscan getabi response or human-readable lines such as "function balanceOf(address) view returns (uint256)".
• Filter by text, by errors and by method category (calls, transactions, logs, chain, other), and move through the list with the keyboard, like the Network tab.

PRIVACY
The extension needs only the "storage" permission and requests no host access. Captured traffic stays in memory and is never sent anywhere. To decode calls, the extension sends contract addresses and the chain id, which are public on chain, to Sourcify, and to Etherscan with your API key if you enter one. It also asks the page's own RPC endpoint for its chain id and, to find a proxy's implementation, reads the proxy's EIP-1967 slots there, from the page itself when the endpoint refuses the extension. Automatic ABI fetching can be turned off. No analytics, no tracking.

Open source under the MIT license: https://github.com/ahiipsa/web3-devtools-extension
```

**Store icon**: `store/icon-128.png` (128×128, 96×96 artwork with 16 px transparent padding; regenerate with `npm run icons`)

**Small promo tile**: `store/promo-small.png` (440×280)

**Marquee promo tile**: `store/promo-marquee.png` (1400×560, optional; shown only if the store features the extension)

Both tiles are rendered from `store/promo-*.svg` by `npm run icons`; the marquee shows `store/screenshots/1-table.png`, so rerun it after retaking the screenshots.

**Screenshots** (1280×800, in this order; retake with `WINDOW_SIZE=1440,870 node store/screenshots.mjs` after `npm run build`):

1. `store/screenshots/1-table.png`: the RPC Requests of curve.finance, decoded
2. `store/screenshots/2-overview.png`: an RPC Request's Overview
3. `store/screenshots/3-response.png`: a decoded return value
4. `store/screenshots/4-multicall.png`: a Multicall3 call of app.ens.domains with its Inner Calls
5. `store/screenshots/5-contract.png`: a Contract fetched from Sourcify

**Official URL**: none

**Homepage URL**: https://github.com/ahiipsa/web3-devtools-extension

**Support URL**: https://github.com/ahiipsa/web3-devtools-extension/issues

## Privacy practices

**Single purpose**:

```text
Shows the EVM JSON-RPC requests of the page being debugged in a Chrome DevTools panel and decodes them with contract ABIs.
```

**Permission justification, `storage`**:

```text
Saves the user's contracts (address, name and ABI) and the panel's settings (automatic ABI fetching on or off, the optional Etherscan API key) in chrome.storage.local, so later requests can be decoded.
```

**Remote code**: No, I am not using remote code. (All JavaScript ships in the package; Sourcify and Etherscan return JSON ABIs only.)

**Data usage**: tick **Website content** only, and nothing else. Captured traffic stays in memory on the device, but the contract addresses taken from it leave the device, so a reviewer may count them as website content even though they are public on chain; ticking it costs nothing and avoids a rejection. What leaves the device (see `PRIVACY.md`):

- to Sourcify: contract addresses and chain ids;
- to Etherscan, only with the user's key: contract addresses, chain ids and the key itself, sent to the service that issued it (not "Authentication information" collected by the developer);
- to the page's own RPC endpoint: one `eth_chainId`, and for a possible proxy up to two `eth_getStorageAt` reads of its EIP-1967 slots and one beacon `implementation()` call; from the page itself, with its origin and without its cookies, when the endpoint refuses the extension.

**Certifications**: tick all three (no sale of data, no use unrelated to the single purpose, no use for creditworthiness or lending).

**Privacy policy URL**: https://github.com/ahiipsa/web3-devtools-extension/blob/main/PRIVACY.md

## Distribution

- **Payment**: free
- **Visibility**: Public
- **Regions**: all
