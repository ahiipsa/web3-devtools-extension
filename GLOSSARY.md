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

**Method Category**:
The group an RPC Request falls into by its `method`: Calls, Transactions, Logs, Chain or Other. Every method belongs to exactly one Method Category. Wallet actions (accounts, signing) are Other.
_Avoid_: Request type, kind

**RPC Response**:
The JSON-RPC result or error that answers one RPC Request.
_Avoid_: Reply, result

**Contract**:
A user-labelled on-chain address together with the one ABI used to decode RPC Requests sent to it. Identified by address alone: case-insensitive and independent of chain. For a proxy, the ABI is the implementation's.
_Avoid_: Address book entry, account

**Decoding**:
Turning an RPC Request's calldata and its RPC Response's return data into a function name and named arguments, using the target Contract's ABI.
_Avoid_: Parsing, interpreting
