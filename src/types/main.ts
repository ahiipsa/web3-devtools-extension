export interface ContractCall {
  data: `0x${string}`;
  from: `0x${string}`;
  gas?: `0x${string}`;
  to: `0x${string}`;
}

type BlockNumber = string | number;

interface Base {
  id: number;
  jsonrpc: string;
}

interface EthEstimateGas extends Base {
  method: "eth_estimateGas";
  params: [ContractCall, BlockNumber];
}

interface EthBlockNumber extends Base {
  method: "eth_blockNumber";
}

interface EthGetTransactionByHash extends Base {
  method: "eth_getTransactionByHash";
  params: [`0x${string}`];
}

interface EthGetTransactionReceipt extends Base {
  method: "eth_getTransactionReceipt";
  params: [`0x${string}`];
}

interface EthCall extends Base {
  method: "eth_call";
  params: [ContractCall, BlockNumber];
}

interface EthGetBlockByNumber extends Base {
  method: "eth_getBlockByNumber";
  params: [BlockNumber, boolean];
}

interface RpcRequestBase {
  id: string;
  tabId: number;
  url: string;
}

export interface RpcRequestCall extends RpcRequestBase {
  requestBody: EthCall;
}

export interface RpcRequestEstimateGas extends RpcRequestBase {
  requestBody: EthEstimateGas;
}

export interface RpcRequestGetTransactionByHash extends RpcRequestBase {
  requestBody: EthGetTransactionByHash;
}

export interface RpcRequestGetTransactionReceipt extends RpcRequestBase {
  requestBody: EthGetTransactionReceipt;
}

export interface RpcRequestGetBlockByNumber extends RpcRequestBase {
  requestBody: EthGetBlockByNumber;
}

export interface RpcRequestBlockNumber extends RpcRequestBase {
  requestBody: EthBlockNumber;
}

export type RpcRequest =
  | RpcRequestCall
  | RpcRequestEstimateGas
  | RpcRequestBlockNumber
  | RpcRequestGetTransactionByHash
  | RpcRequestGetBlockByNumber
  | RpcRequestGetTransactionReceipt;
