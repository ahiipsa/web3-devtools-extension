import { JsonRpcId } from "../types/main.ts";

// The JSON-RPC id prefix of the Panel's own RPC Requests. One sent from the
// inspected page shows in its network traffic, and the capture skips it by
// this id
const OWN_RPC_REQUEST_ID_PREFIX = "evm-rpc-inspector:";

let lastOwnRpcRequestId = 0;

export const nextOwnRpcRequestId = () =>
  `${OWN_RPC_REQUEST_ID_PREFIX}${++lastOwnRpcRequestId}`;

export const isOwnRpcRequestId = (id: JsonRpcId | undefined) =>
  typeof id === "string" && id.startsWith(OWN_RPC_REQUEST_ID_PREFIX);
