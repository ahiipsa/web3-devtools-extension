import { Abi, decodeFunctionData } from "viem";
import { RpcRequest, RpcRequestStatus } from "../types/main.ts";
import { Contract } from "../dal/contract.ts";
import { getContractCallParams } from "../utils/requestUtils.ts";
import { getRpcRequestStatus } from "../capture/getRpcRequestStatus.ts";
import { trimContractAddress } from "../utils/text.ts";
import { findAbiFunction } from "../decoding/findAbiFunction.ts";

// What one line of the RPC Request table shows, derived once per RPC Request
export interface RpcRequestRow {
  request: RpcRequest;
  method: string;
  // The Contract's name, else its short address; none when no Contract is called
  contractLabel?: string;
  // For search: the full address, and the user's name for the Contract if any
  contractAddress?: string;
  contractName?: string;
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

// Same outcome as Decoding the calldata: no name unless it fully decodes
const getFunctionName = (abi: Abi, data: `0x${string}`) => {
  const abiFunction = findAbiFunction(abi, data);
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
    contractLabel:
      callParams && (contract?.name || trimContractAddress(callParams.to)),
    contractAddress: callParams?.to,
    contractName: contract?.name || undefined,
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

// The second line under the method while the details are open
export function formatContractCall({
  contractLabel,
  functionName,
}: Pick<RpcRequestRow, "contractLabel" | "functionName">) {
  return [contractLabel, functionName].filter(Boolean).join(" / ");
}
