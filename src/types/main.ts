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

export interface RpcRequest {
  id: string;
  url: string;
  requestBody: RpcRequestBody;
  response?: RpcResponseBody;
}
