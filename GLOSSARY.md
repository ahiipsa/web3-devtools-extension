# EVM RPC Inspector

A Chrome DevTools extension that lets web3 developers inspect and decode the EVM JSON-RPC traffic of the page they are debugging.

## Language

**Panel**:
The "EVM RPC" tab inside Chrome DevTools where the extension's UI lives.
_Avoid_: Popup, devtools page, window

**RPC Request**:
A single EVM JSON-RPC call (one `method` + `params`) sent by the inspected page. A batch POST yields several RPC Requests.
_Avoid_: HTTP request, call, log

**Endpoint**:
The URL an RPC Request was sent to. One page can talk to several Endpoints.
_Avoid_: RPC URL, node, provider

**Chain**:
The EVM network an Endpoint serves, identified by its chain id.
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

**Contract**:
A labelled on-chain address together with the one ABI used to decode RPC Requests sent to it, added by the user or fetched from an ABI Source. Identified by address alone: case-insensitive and independent of Chain. For a proxy, the ABI is the implementation's.
_Avoid_: Address book entry, account

**ABI Source**:
A public registry of verified contracts (Sourcify, Etherscan) the extension fetches a Contract's ABI from, by Chain and address.
_Avoid_: Explorer, verifier

**Decoding**:
Turning an RPC Request's calldata and its RPC Response's return data into a function name and named arguments, using the target Contract's ABI.
_Avoid_: Parsing, interpreting

**Selector**:
The first 4 bytes of an RPC Request's calldata, naming the function it calls.
_Avoid_: Function id, signature hash, method id
