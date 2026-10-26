# EVM RPC Inspector

A Chrome DevTools extension that lets web3 developers inspect and decode the EVM JSON-RPC traffic of the page they are debugging.

- Lists every JSON-RPC request the page sends as an RPC Request, one per entry of a batch, paired with its RPC Response
- Decodes `eth_call`, `eth_estimateGas` and `eth_sendTransaction` into a function name and named arguments using an ABI you provide
- Needs only the `storage` permission; nothing leaves your device (see [PRIVACY.md](PRIVACY.md))

## Install

Build `release/evm-rpc-inspector-<version>.zip` (see [Release](#release)), then:

1. Unzip the archive.
2. Open `chrome://extensions` and enable "Developer mode".
3. Click "Load unpacked" and select the unzipped folder.

## Usage

1. Open DevTools on the page you want to debug and switch to the **EVM RPC** tab (the Panel).
2. Use the dApp. RPC Requests appear in the list as they finish. Traffic sent before the Panel was first opened is not captured, so reload the page if needed.
3. Select an RPC Request to see its params and RPC Response.
4. For an RPC Request to a contract, click the settings icon to add the Contract: give it a name and paste its ABI (for a proxy, the implementation's ABI). RPC Requests to that address are then decoded.

The list is cleared when the page navigates or reloads, or with the "Clear" button. Contracts are kept until you remove the extension.

## Development

Requires Node.js 18+.

```sh
npm install
npm run watch   # rebuild into build/ on every change
```

Load the `build/` folder as an unpacked extension (see [Install](#install)), and reload it from `chrome://extensions` after a rebuild.

```sh
npm test        # unit tests (Vitest)
npm run lint
npm run build   # typecheck and production build into build/
```

Project layout:

- `src/`: the Panel (React), RPC capture, Decoding and Contract storage
- `manifest.ts`: source of the generated `manifest.json`; the version comes from `package.json`
- `public/`: popup and icons, copied into the build as-is
- `assets/icon.svg`: source of the PNG icons
- `GLOSSARY.md` and `docs/adr/`: domain language and architecture decisions

## Release

1. Set the new version in `package.json`.
2. Run `npm run release` (needs `zip`, available on macOS and Linux).

This writes `release/evm-rpc-inspector-<version>.zip`, ready to upload to the Chrome Web Store.

## Acknowledgements

Started from [5tigerjelly/chrome-extension-react-template](https://github.com/5tigerjelly/chrome-extension-react-template) by Chris Oh (MIT).

## License

[MIT](LICENSE)
