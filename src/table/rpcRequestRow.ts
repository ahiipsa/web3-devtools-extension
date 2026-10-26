import { Abi, AbiFunction, decodeFunctionData, toFunctionSelector } from "viem";
import { RpcRequest, RpcRequestStatus } from "../types/main.ts";
import { Contract } from "../dal/contract.ts";
import { getContractCallParams } from "../utils/requestUtils.ts";
import { getRpcRequestStatus } from "../capture/getRpcRequestStatus.ts";
import { trimContractAddress } from "../utils/text.ts";

// What one line of the RPC Request table shows, derived once per RPC Request
export interface RpcRequestRow {
  request: RpcRequest;
  method: string;
  // The Contract's name, else its short address; none when no Contract is called
  contract?: string;
  functionName?: string;
  status?: string;
  // Any status other than ok
  failed: boolean;
  // The Endpoint's host
  endpoint: string;
  // Duration in milliseconds
  time: number;
}

export type FindContract = (address: `0x${string}`) => Contract | undefined;

// Selector lookups are built once per ABI: decoding thousands of rows with
// viem's whole-ABI search would hash every function signature per row
const selectorsByAbi = new WeakMap<Abi, Map<string, AbiFunction>>();

const getSelectors = (abi: Abi) => {
  let selectors = selectorsByAbi.get(abi);
  if (!selectors) {
    selectors = new Map();
    for (const item of abi) {
      if (item.type === "function") {
        selectors.set(toFunctionSelector(item), item);
      }
    }
    selectorsByAbi.set(abi, selectors);
  }
  return selectors;
};

// Same outcome as Decoding the calldata: no name unless it fully decodes
const getFunctionName = (abi: Abi, data: `0x${string}`) => {
  const abiFunction = getSelectors(abi).get(data.slice(0, 10).toLowerCase());
  if (!abiFunction) {
    return undefined;
  }
  try {
    return decodeFunctionData({ abi: [abiFunction], data }).functionName;
  } catch {
    return undefined;
  }
};

const getHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const formatStatus = (status: RpcRequestStatus | undefined) => {
  switch (status?.kind) {
    case "ok":
      return "ok";
    case "error":
      return `error ${status.code}`;
    case "http":
      return `HTTP ${status.code}`;
    default:
      return undefined;
  }
};

export function buildRpcRequestRow(
  request: RpcRequest,
  findContract: FindContract,
): RpcRequestRow {
  const callParams = getContractCallParams(request);
  const contract = callParams && findContract(callParams.to);
  const status = getRpcRequestStatus(request);

  return {
    request,
    method: request.requestBody.method,
    contract:
      callParams && (contract?.name || trimContractAddress(callParams.to)),
    functionName:
      contract && callParams?.data
        ? getFunctionName(contract.abi, callParams.data)
        : undefined,
    status: formatStatus(status),
    failed: status !== undefined && status.kind !== "ok",
    endpoint: getHost(request.url),
    time: request.time,
  };
}

export function formatDuration(milliseconds: number) {
  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(2)} s`;
}
