export type JsonRpcId = number | string | null;

export interface RpcRequestBody {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface RpcResponseBody {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ContractCall {
  data?: `0x${string}`;
  input?: `0x${string}`;
  from?: `0x${string}`;
  gas?: `0x${string}`;
  to: `0x${string}`;
}

export const METHOD_CATEGORIES = [
  "Calls",
  "Transactions",
  "Logs",
  "Chain",
  "Other",
] as const;

export type MethodCategory = (typeof METHOD_CATEGORIES)[number];

export type RpcRequestStatus =
  | { kind: "ok" }
  | { kind: "error"; code: number; message: string }
  // HTTP status outside 2xx; 0 when the request never got an HTTP response
  | { kind: "http"; code: number }
  // HTTP succeeded, but the body holds no RPC Response for this RPC Request
  | { kind: "no-response" };

export interface RpcRequest {
  id: string;
  url: string;
  requestBody: RpcRequestBody;
  response?: RpcResponseBody;
  methodCategory: MethodCategory;
  // Taken from the network entry; shared by all RPC Requests of one batch.
  startedDateTime: string;
  // Duration in milliseconds.
  time: number;
  httpStatus: number;
  // Whether the HTTP response body held any RPC Response at all.
  hasRpcResponseBody: boolean;
}
