# EVM RPC Inspector

A Chrome DevTools extension that lets web3 developers inspect and decode the EVM JSON-RPC traffic of the page they are debugging.

- Lists every JSON-RPC request the page sends as an RPC Request, one per entry of a batch, paired with its RPC Response
- Decodes `eth_call`, `eth_estimateGas` and `eth_sendTransaction` into a function name and named arguments
- Fetches the verified ABI of a called contract from [Sourcify](https://sourcify.dev) automatically, and from [Etherscan](https://etherscan.io) with your API key, or uses an ABI you provide
- Needs only the `storage` permission; only contract addresses and the chain id are sent, to Sourcify and, with your key, to Etherscan, and this can be turned off (see [PRIVACY.md](PRIVACY.md))

## Install

Build `release/evm-rpc-inspector-<version>.zip` (see [Release](#release)), then:

1. Unzip the archive.
2. Open `chrome://extensions` and enable "Developer mode".
3. Click "Load unpacked" and select the unzipped folder.

## Usage

1. Open DevTools on the page you want to debug and switch to the **EVM RPC** tab (the Panel).
2. Use the dApp. RPC Requests appear in the list as they finish. Traffic sent before the Panel was first opened is not captured, so reload the page if needed.
3. Select an RPC Request to see its params and RPC Response.
4. RPC Requests to a contract verified on Sourcify are decoded on their own: the Panel fetches its ABI and saves it as a Contract named after it, shown as "From Sourcify" in the **Contract** tab. With an Etherscan API key (step 7), a contract Sourcify does not know is looked up on Etherscan too and shown as "From Etherscan". The chain id comes from the page's own `eth_chainId` call, or the Panel asks the RPC endpoint once, whether or not ABIs are fetched, from the inspected page itself if the endpoint answers only its own site (such a request shows in the page's Network tab, not in the Panel); the table's **Chain** column shows it, by name for common chains. For a proxy, the Contract at the proxy's address gets its implementation's ABI and name, shown as "via proxy": the implementation is the one the ABI source names, else the one in the proxy's EIP-1967 slots, which the Panel reads from the RPC endpoint. For a Multicall (Multicall3 or Multicall2), the **Params** tab lists its Inner Calls, and the target of each Inner Call is fetched the same way; at most 4 ABI fetches run at once.
5. Otherwise open the RPC Request's **Contract** tab. Its first line says where the ABI comes from: saved by you, an ABI Source (for a proxy, with the implementation's address), the built-in Multicall3 ABI, or whether it is being fetched, is not verified on Sourcify (or Etherscan) or failed to fetch, and "Fetch ABI" tries again. Or add the Contract yourself: give it a name and paste its ABI (for a proxy, the implementation's ABI) as a JSON array, a build artifact with an `abi` array (Hardhat, Foundry) or an Etherscan `getabi` response, or human-readable lines such as `function balanceOf(address) view returns (uint256)`. Saving it there, or "Save as mine" on a fetched Contract, makes it yours; a fetched Contract never replaces one you saved. "Forget fetched ABI" removes a fetched Contract until DevTools reopens, or, with automatic fetching off (step 7), until "Fetch ABI" fetches it again; "Delete" removes yours for good. In a Multicall's **Params** tab, an Inner Call whose target has no Contract shows the same fetch state and an "Add ABI" button, which opens the **Contract** tab for that target.
6. To remove a Contract, open its **Contract** tab again, press "Delete" and confirm. RPC Requests to that address are no longer decoded.
7. To stop fetching ABIs automatically, click the gear at the right end of the filter toolbar and uncheck "Fetch ABIs automatically". "Fetch ABI" still works. The same popover takes an optional Etherscan API key (a free one from [etherscan.io](https://etherscan.io/myapikey)); it is stored on your device and sent only to Etherscan.

The list is cleared when the page navigates or reloads, or with the "Clear" button. Contracts are kept until you delete them or remove the extension.

## Development

Requires Node.js 22.12+, 24 or 26+ (the range of Vitest 5).

```sh
npm install
npm run watch   # rebuild into build/ on every change
```

Load the `build/` folder as an unpacked extension (see [Install](#install)), and reload it from `chrome://extensions` after a rebuild.

```sh
npm test        # unit tests (Vitest)
npm run lint
npm run build   # typecheck and production build into build/
npm run icons   # regenerate public/icons/*.png, the store icon and promo tiles (needs rsvg-convert: brew install librsvg)
```

Project layout:

- `src/`: the Panel (React), RPC capture, Decoding, Contract storage and fetching ABIs from ABI Sources (`src/abiSources/`)
- `manifest.ts`: source of the generated `manifest.json`; the version comes from `package.json`
- `public/`: popup and icons, copied into the build as-is
- `assets/icon.svg`: source of the PNG icons in `public/icons/`, regenerated with `npm run icons`; `assets/store-icon.svg` pads it into the store icon
- `store/`: the Chrome Web Store listing (`listing.md`), its icon, promo tiles and screenshots, and `screenshots.mjs`, which retakes them
- `GLOSSARY.md` and `docs/adr/`: domain language and architecture decisions

## Release

1. Set the new version in `package.json`.
2. Run `npm run release` (needs `zip`, available on macOS and Linux).

This writes `release/evm-rpc-inspector-<version>.zip`, ready to upload to the Chrome Web Store with the texts, icon and screenshots in [`store/listing.md`](store/listing.md). Retake the screenshots when the Panel's look changes.

## Acknowledgements

Started from [5tigerjelly/chrome-extension-react-template](https://github.com/5tigerjelly/chrome-extension-react-template) by Chris Oh (MIT).

## License

[MIT](LICENSE)
