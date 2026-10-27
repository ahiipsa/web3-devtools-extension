# Privacy Policy

EVM RPC Inspector is a Chrome DevTools extension. It does not collect or sell any data. To decode contract calls, it looks up public contract ABIs on Sourcify, as described below; you can turn this off.

## What the extension reads

From the moment its "EVM RPC" Panel is first opened in DevTools until DevTools is closed, the extension reads the network traffic of the inspected tab through the Chrome DevTools network API and picks out JSON-RPC requests and their responses.

## What the extension stores

- **Captured traffic** is kept in memory only. It is never written to disk, and it is discarded when the inspected page navigates or reloads, when you press "Clear", or when DevTools is closed.
- **Contracts** (contract address, a name and an ABI), whether you add them or they are fetched from Sourcify, are saved in `chrome.storage.local` on your device, so they can be used to decode later requests.
- **Settings** of the Panel (whether ABIs are fetched automatically) are saved in `chrome.storage.local`.
- The chain id of each RPC endpoint is kept in memory only, until DevTools is closed.

## What the extension sends

By default, when the inspected page calls a contract (`eth_call`, `eth_estimateGas` or `eth_sendTransaction`) at an address that has no saved Contract, the extension sends:

- **To Sourcify** (`https://sourcify.dev`, a public registry of verified contracts): the contract address and the chain id, to fetch the contract's verified ABI. Once per address and chain while DevTools stays open, and again when you press "Fetch ABI".
- **To the RPC endpoint the page itself used**: one `eth_chainId` request, to learn the chain id, if the page has not already asked for it. Once per endpoint while DevTools stays open.

Nothing else is sent: no calldata, no responses, no page URLs and no information about you. The contract addresses and chain ids are already public on chain. Sourcify's own privacy policy applies to the requests it receives.

**To turn this off**, click the gear button at the right end of the Panel's filter toolbar and uncheck "Fetch ABIs automatically". Nothing is then sent unless you press "Fetch ABI" on a Contract tab.

The extension contains no analytics or tracking and shares no data with the developer.

## Permissions

- `storage`: to save Contracts and settings in `chrome.storage.local`.

The extension requests no host permissions and no access to the websites you visit outside of DevTools. Sourcify and the RPC endpoints are reached as any web page would reach them, through their open CORS.

## Deleting your data

To delete a single Contract, open the Contract tab of an RPC Request sent to its address, press "Delete" and confirm. It is removed from `chrome.storage.local` at once.

Removing the extension from Chrome deletes everything it stored.

## Contact

Questions and reports: https://github.com/ahiipsa/web3-devtools-extension/issues
