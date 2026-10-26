# Privacy Policy

EVM RPC Inspector is a Chrome DevTools extension. It does not collect, transmit or sell any data.

## What the extension reads

From the moment its "EVM RPC" Panel is first opened in DevTools until DevTools is closed, the extension reads the network traffic of the inspected tab through the Chrome DevTools network API and picks out JSON-RPC requests and their responses.

## What the extension stores

- **Captured traffic** is kept in memory only. It is never written to disk, and it is discarded when the inspected page navigates or reloads, when you press "Clear", or when DevTools is closed.
- **Contracts** you add (contract address, the name you give it and the ABI you paste) are saved in `chrome.storage.local` on your device, so they can be used to decode later requests.

## What the extension sends

Nothing. The extension makes no network requests of its own, contains no analytics or tracking, and shares no data with the developer or any third party.

## Permissions

- `storage`: to save the Contracts you add in `chrome.storage.local`.

The extension requests no host permissions and no access to the websites you visit outside of DevTools.

## Deleting your data

To delete a single Contract, open the Contract tab of an RPC Request sent to its address, press "Delete" and confirm. It is removed from `chrome.storage.local` at once.

Removing the extension from Chrome deletes everything it stored.

## Contact

Questions and reports: https://github.com/ahiipsa/web3-devtools-extension/issues
