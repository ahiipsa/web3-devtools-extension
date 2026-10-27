import { Abi, AbiFunction, AbiParameter, decodeAbiParameters, Hex } from "viem";
import { findAbiFunction } from "./findAbiFunction.ts";
import { RpcRequest } from "../types/main.ts";
import { getContractCallParams } from "../utils/requestUtils.ts";

// One decoded argument or return value, labelled by its ABI name or, when
// the ABI leaves it unnamed, by its position (`[0]`, `[1]`, …)
export interface DecodedValue {
  name: string;
  type: string;
  value: unknown;
}

export type Decoding =
  | {
      status: "decoded";
      functionName: string;
      signature: string;
      args: DecodedValue[];
      returnValues?: DecodedValue[];
      returnValueMismatch?: true;
    }
  | { status: "mismatch" };

const decodeValues = (
  params: readonly AbiParameter[],
  data: Hex,
): DecodedValue[] | undefined => {
  try {
    const values = decodeAbiParameters(params, data);
    return params.map((param, index) => ({
      name: param.name || `[${index}]`,
      type: param.type,
      value: values[index],
    }));
  } catch {
    return undefined;
  }
};

const buildSignature = (fn: AbiFunction) =>
  `${fn.name}(${fn.inputs
    .map((input) => [input.type, input.name].filter(Boolean).join(" "))
    .join(", ")})`;

export function decodeRpcRequest(
  request: RpcRequest,
  abi: Abi,
): Decoding | undefined {
  const callParams = getContractCallParams(request);
  if (!callParams?.data) {
    return undefined;
  }

  const fn = findAbiFunction(abi, callParams.data);
  const args = fn && decodeValues(fn.inputs, `0x${callParams.data.slice(10)}`);
  if (!fn || !args) {
    return { status: "mismatch" };
  }

  const decoding: Extract<Decoding, { status: "decoded" }> = {
    status: "decoded",
    functionName: fn.name,
    signature: buildSignature(fn),
    args,
  };

  // Only eth_call returns the function's return data
  const returnData = request.response?.result;
  if (
    request.requestBody.method === "eth_call" &&
    typeof returnData === "string"
  ) {
    const returnValues = decodeValues(fn.outputs ?? [], returnData as Hex);
    if (returnValues) {
      decoding.returnValues = returnValues;
    } else {
      decoding.returnValueMismatch = true;
    }
  }

  return decoding;
}
