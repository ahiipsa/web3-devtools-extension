import { Abi, decodeFunctionData } from "viem";
import { RpcRequest } from "../types/main.ts";
import { FindContract } from "../dal/contract.ts";
import { getContractCallParams } from "../utils/requestUtils.ts";
import {
  formatRpcRequestStatus,
  getRpcRequestStatus,
  isFailedRpcRequestStatus,
} from "../capture/getRpcRequestStatus.ts";
import { trimContractAddress } from "../utils/text.ts";
import { findAbiFunction } from "../decoding/findAbiFunction.ts";
import {
  findDecodingContract,
  getInnerCalls,
  InnerCall,
} from "../decoding/multicall.ts";

// What the table knows of one Inner Call of a Multicall: what a search
// matches, and whether it failed for the Method column's count
export interface InnerCallRow {
  // The full target address, and the Contract's name if any
  contractAddress: `0x${string}`;
  contractName?: string;
  functionName?: string;
  functionSelector?: `0x${string}`;
  // Its own success flag says it failed
  failed: boolean;
}

// What one line of the RPC Request table shows, derived once per RPC Request
export interface RpcRequestRow {
  request: RpcRequest;
  method: string;
  // The Contract's name, else its short address; none when no Contract is called
  contractLabel?: string;
  // For search: the full address, and the Contract's name if any
  contractAddress?: string;
  contractName?: string;
  // Decoded with the Contract's ABI
  functionName?: string;
  // The first 4 bytes of the calldata, lowercase; set whenever there are any
  functionSelector?: `0x${string}`;
  status: string;
  // Any status other than ok
  failed: boolean;
  // The Endpoint's host
  endpoint: string;
  // Duration in milliseconds
  time: number;
  // Set for a Multicall only
  innerCalls?: InnerCallRow[];
}

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

const getFunctionSelector = (data: string | undefined) =>
  data && /^0x[0-9a-f]{8}/i.test(data)
    ? (data.slice(0, 10).toLowerCase() as `0x${string}`)
    : undefined;

const getHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const buildInnerCallRow = ({
  target,
  callData,
  contractName,
  decoding,
  success,
}: InnerCall): InnerCallRow => ({
  contractAddress: target,
  contractName,
  functionName:
    decoding?.status === "decoded" ? decoding.functionName : undefined,
  functionSelector: getFunctionSelector(callData),
  failed: success === false,
});

export function buildRpcRequestRow(
  request: RpcRequest,
  findContract: FindContract,
): RpcRequestRow {
  const callParams = getContractCallParams(request);
  const contract =
    callParams &&
    findDecodingContract(findContract, callParams.to, callParams.data);
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
    functionSelector: getFunctionSelector(callParams?.data),
    status: formatRpcRequestStatus(status),
    failed: isFailedRpcRequestStatus(status),
    endpoint: getHost(request.url),
    time: request.time,
    innerCalls: getInnerCalls(request, findContract)?.map(buildInnerCallRow),
  };
}

export function formatDuration(milliseconds: number) {
  return milliseconds < 1000
    ? `${Math.round(milliseconds)} ms`
    : `${(milliseconds / 1000).toFixed(2)} s`;
}

type FunctionFields = Pick<RpcRequestRow, "functionName" | "functionSelector">;

// The Function column: the decoded name, else the selector shown muted
export function getFunctionLabel({
  functionName,
  functionSelector,
}: FunctionFields) {
  if (functionName) {
    return { text: functionName, decoded: true };
  }
  if (functionSelector) {
    return { text: functionSelector, decoded: false };
  }
  return undefined;
}
