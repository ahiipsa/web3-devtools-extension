import { Abi, decodeFunctionData, decodeFunctionResult } from "viem";
import { RpcRequest } from "../types/main.ts";
import {
  buildFunctionSignatureFromAbi,
  getContractCallParams,
} from "../utils/requestUtils.ts";

export type Decoding =
  | {
      status: "decoded";
      functionName: string;
      signature: string;
      args: readonly unknown[];
      returnValue?: unknown;
      returnValueMismatch?: true;
    }
  | { status: "mismatch" };

const decodeCalldata = (abi: Abi, data: `0x${string}`) => {
  try {
    return decodeFunctionData({ abi, data });
  } catch {
    return undefined;
  }
};

export function decodeRpcRequest(
  request: RpcRequest,
  abi: Abi,
): Decoding | undefined {
  const callParams = getContractCallParams(request);
  if (!callParams?.data) {
    return undefined;
  }

  const calldata = decodeCalldata(abi, callParams.data);
  if (!calldata) {
    return { status: "mismatch" };
  }
  const { functionName, args = [] } = calldata;

  const decoding: Extract<Decoding, { status: "decoded" }> = {
    status: "decoded",
    functionName,
    signature: buildFunctionSignatureFromAbi(functionName, args.length, abi),
    args,
  };

  // Only eth_call returns the function's return data
  const returnData = request.response?.result;
  if (
    request.requestBody.method === "eth_call" &&
    typeof returnData === "string"
  ) {
    try {
      decoding.returnValue = decodeFunctionResult({
        abi,
        functionName,
        data: returnData as `0x${string}`,
      });
    } catch {
      decoding.returnValueMismatch = true;
    }
  }

  return decoding;
}
