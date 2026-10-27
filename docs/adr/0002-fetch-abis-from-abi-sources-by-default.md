# Fetch ABIs from public ABI Sources by default

When the Panel sees an RPC Request to an address without a Contract, it fetches the verified ABI from Sourcify and, if the user has entered an Etherscan API key, from Etherscan, and saves it as a Contract. This is on by default and can be turned off in the Panel's settings. Until now the extension made no network requests of its own and promised that nothing left the device; the addresses of called contracts and the Chain id now go to those ABI Sources.

We chose convenience over the stricter privacy default: pasting ABIs by hand for every contract was the main friction of the Panel, and the data sent (public contract addresses and a chain id) is already public on chain. Both ABI Sources answer with open CORS, so no host permissions are needed and the install warning stays as it is (see 0001).

## Consequences

`PRIVACY.md`, the README and the Chrome Web Store data disclosure must say what is sent and to whom, and how to turn it off. Turning the default off later breaks the "it just decodes" experience for existing users; turning it on was the visible change, so do not silently widen what is sent (e.g. calldata, page URLs, other services) without revisiting this record.

The target addresses of a Multicall's Inner Calls are called contracts too, and are fetched under the same rules; this sends more public addresses, not a new kind of data.
