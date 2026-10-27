# Privacy Policy

EVM RPC Inspector is a Chrome DevTools extension. It does not collect or sell any data. To decode contract calls, it looks up public contract ABIs on Sourcify and, if you enter an Etherscan API key, on Etherscan, as described below; you can turn this off.

## What the extension reads

From the moment its "EVM RPC" Panel is first opened in DevTools until DevTools is closed, the extension reads the network traffic of the inspected tab through the Chrome DevTools network API and picks out JSON-RPC requests and their responses.

## What the extension stores

- **Captured traffic** is kept in memory only. It is never written to disk, and it is discarded when the inspected page navigates or reloads, when you press "Clear", or when DevTools is closed.
- **Contracts** (contract address, a name and an ABI), whether you add them or they are fetched from Sourcify or Etherscan, are saved in `chrome.storage.local` on your device, so they can be used to decode later requests.
- **Settings** of the Panel (whether ABIs are fetched automatically, and your Etherscan API key if you enter one) are saved in `chrome.storage.local`. The key is sent only to Etherscan; it is never logged or shown outside its settings field.
- The chain id of each RPC endpoint is kept in memory only, until DevTools is closed.

## What the extension sends

By default, when the inspected page calls a contract (`eth_call`, `eth_estimateGas` or `eth_sendTransaction`) at an address that has no saved Contract, the extension sends the following. When that call is a Multicall (a call to a Multicall3 or Multicall2 aggregator bundling several contract calls), the same goes for the target address of each bundled call that has no saved Contract. At most 4 ABI lookups run at once; the rest wait.

- **To Sourcify** (`https://sourcify.dev`, a public registry of verified contracts): the contract address and the chain id, to fetch the contract's verified ABI and, for a proxy, its implementation's address. Once per address and chain while DevTools stays open, and again when you press "Fetch ABI".
- **To Etherscan** (`https://api.etherscan.io`), only if you have entered an Etherscan API key and Sourcify has no verified ABI for the contract or fails to answer: the contract address, the chain id and your API key, to fetch the contract's verified ABI. As often as Sourcify, at most 4 requests a second.
- **To the RPC endpoint the page itself used**: one `eth_chainId` request, to learn the chain id, if the page has not asked for it itself within a second. Once per endpoint while DevTools stays open.
- **To the same RPC endpoint**, for each contract it fetches an ABI for whose ABI source says nothing about it being a proxy: up to two `eth_getStorageAt` requests reading the contract's EIP-1967 proxy slots and, for a beacon proxy, one `eth_call` of `implementation()` on the beacon, to find a proxy's implementation. The implementation's ABI is then fetched from Sourcify and Etherscan as above. Once per address and chain while DevTools stays open.

Nothing else is sent: no calldata, no responses, no page URLs and no information about you. The contract addresses and chain ids are already public on chain. The privacy policies of Sourcify and Etherscan apply to the requests they receive.

**To turn this off**, click the gear button at the right end of the Panel's filter toolbar and uncheck "Fetch ABIs automatically". Nothing is then sent unless you press "Fetch ABI" on a Contract tab (also reached through "Add ABI" on a Multicall's bundled call). To stop only the requests to Etherscan, clear the "Etherscan API key" field there.

The extension contains no analytics or tracking and shares no data with the developer.

## Permissions

- `storage`: to save Contracts and settings in `chrome.storage.local`.

The extension requests no host permissions and no access to the websites you visit outside of DevTools. Sourcify, Etherscan and the RPC endpoints are reached as any web page would reach them, through their open CORS.

## Deleting your data

To delete a single Contract, open the Contract tab of an RPC Request sent to its address, press "Delete" and confirm. It is removed from `chrome.storage.local` at once.

Removing the extension from Chrome deletes everything it stored.

## Contact

Questions and reports: https://github.com/ahiipsa/web3-devtools-extension/issues
