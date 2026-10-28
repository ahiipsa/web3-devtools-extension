# EVM RPC Inspector

A Chrome DevTools extension that lets web3 developers inspect and decode the EVM JSON-RPC traffic of the page they are debugging.

## Language

**Panel**:
The "EVM RPC" tab inside Chrome DevTools where the extension's UI lives.
_Avoid_: Popup, devtools page, window

**RPC Request**:
A single EVM JSON-RPC call (one `method` + `params`) sent by the inspected page. A Batch yields several RPC Requests.
_Avoid_: HTTP request, call, log

**Batch**:
One HTTP POST carrying several RPC Requests at once. Its RPC Requests share its Endpoint, HTTP status, start time and duration; each keeps its own position in it.
_Avoid_: Bulk request, Multicall

**Endpoint**:
The URL an RPC Request was sent to. One page can talk to several Endpoints.
_Avoid_: RPC URL, node, provider

**Chain**:
The EVM network an Endpoint serves, identified by its chain id. An RPC Request's Chain is its Endpoint's Chain when it was sent; an Endpoint can switch Chains, e.g. a restarted local fork.
_Avoid_: Network, chainId

**Method Category**:
The group an RPC Request falls into by its `method`: Calls, Transactions, Logs, Chain or Other. Every method belongs to exactly one Method Category. Wallet actions (accounts, signing) are Other.
_Avoid_: Request type, kind

**Selected RPC Request**:
The highlighted RPC Request in the Panel, whether or not its details are open. At most one at a time.
_Avoid_: Active request, current row

**RPC Response**:
The JSON-RPC object paired by `id` with one RPC Request; a valid one carries a result or an error.
_Avoid_: Reply, result

**Status**:
The outcome of an RPC Request: ok, an RPC error from its RPC Response, or, without a valid RPC Response, an HTTP failure, no response, an invalid response or failed (no HTTP response at all). Every Status but ok counts as failed.
_Avoid_: Result, state

**Revert**:
Why an RPC Request or an Inner Call failed in the EVM: an `Error(string)` message, a Panic code or a custom error, decoded from its revert data. An RPC Request's Revert comes in its RPC error.
_Avoid_: Revert reason, failure reason, error data

**Contract**:
A labelled on-chain address together with the one ABI used to decode RPC Requests sent to it, added by the user or fetched from an ABI Source. Identified by address alone: case-insensitive and independent of Chain. For a proxy, the ABI is the implementation's. A fetched Contract keeps the ABI Source it came from until the user saves it as their own.
_Avoid_: Address book entry, account

**ABI Source**:
A public registry of verified contracts (Sourcify, Etherscan) the extension fetches a Contract's ABI from, by Chain and address.
_Avoid_: Explorer (the site links lead to), verifier

**Explorer**:
A Chain's public website where an address, a transaction or a block can be looked up (Etherscan, Basescan, Blockscout). The Panel links to the Explorer of an RPC Request's Chain; a Chain without a known Explorer, such as a local one, gets no links. Etherscan is both an ABI Source and an Explorer.
_Avoid_: Block explorer, scanner, ABI Source

**Decoding**:
Turning an RPC Request's calldata and its RPC Response's return data into a function name and named arguments, using the target Contract's ABI.
_Avoid_: Parsing, interpreting

**Multicall**:
An RPC Request that calls an aggregator contract (Multicall3, Multicall2) to bundle several Inner Calls into one, recognised by the aggregator function it calls, at any address. Without a Contract at its address, a Multicall decodes with the built-in aggregator ABI, named Multicall3.
_Avoid_: Batch (a Batch is several RPC Requests), aggregate call

**Inner Call**:
One call bundled in a Multicall: a target address, its calldata and, when the RPC Response carries it, its own success flag and return data. Not an RPC Request: it has no `id`, Endpoint or Status of its own. An Inner Call that is itself a Multicall is not unpacked further.
_Avoid_: Subcall, child, nested request

**Selector**:
The first 4 bytes of an RPC Request's calldata, naming the function it calls.
_Avoid_: Function id, signature hash, method id
