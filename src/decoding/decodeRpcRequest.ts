import { Abi, AbiFunction, AbiParameter, decodeAbiParameters, Hex } from "viem";
import { findAbiFunction } from "./findAbiFunction.ts";
import { RpcRequest } from "../types/main.ts";
import { getContractCallParams } from "../utils/requestUtils.ts";

// One decoded argument or return value, labelled by its ABI name or, when
// the ABI leaves it unnamed, by its position (`[0]`, `[1]`, …). A lone
// unnamed argument or return value has no position worth showing: its name
// is empty and its type alone labels it
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

// Labels decoded values with their parameters
export const labelValues = (
  params: readonly AbiParameter[],
  values: readonly unknown[],
): DecodedValue[] =>
  params.map((param, index) => ({
    name: param.name || (params.length > 1 ? `[${index}]` : ""),
    type: param.type,
    value: values[index],
  }));

const decodeValues = (
  params: readonly AbiParameter[],
  data: Hex,
): DecodedValue[] | undefined => {
  try {
    return labelValues(params, decodeAbiParameters(params, data));
  } catch {
    return undefined;
  }
};

// A tuple's type spells out its components, so `tuple[] calls` reads
// `(address to, uint256 value)[] calls`
const formatParameterType = (param: AbiParameter): string =>
  "components" in param && param.type.startsWith("tuple")
    ? `(${param.components.map(formatParameter).join(", ")})${param.type.slice("tuple".length)}`
    : param.type;

const formatParameter = (param: AbiParameter): string =>
  [formatParameterType(param), param.name].filter(Boolean).join(" ");

const buildSignature = (fn: AbiFunction) =>
  `${fn.name}(${fn.inputs.map(formatParameter).join(", ")})`;

// Decodes calldata, and return data when given, with the function its
// Selector names in the ABI
export function decodeCall(abi: Abi, data: Hex, returnData?: Hex): Decoding {
  const fn = findAbiFunction(abi, data);
  const args = fn && decodeValues(fn.inputs, `0x${data.slice(10)}`);
  if (!fn || !args) {
    return { status: "mismatch" };
  }

  const decoding: Extract<Decoding, { status: "decoded" }> = {
    status: "decoded",
    functionName: fn.name,
    signature: buildSignature(fn),
    args,
  };

  if (returnData !== undefined) {
    const returnValues = decodeValues(fn.outputs ?? [], returnData);
    if (returnValues) {
      decoding.returnValues = returnValues;
    } else {
      decoding.returnValueMismatch = true;
    }
  }

  return decoding;
}

// Only eth_call returns the function's return data
export const getReturnData = (request: RpcRequest): Hex | undefined => {
  const returnData = request.response?.result;
  return request.requestBody.method === "eth_call" &&
    typeof returnData === "string"
    ? (returnData as Hex)
    : undefined;
};

export function decodeRpcRequest(
  request: RpcRequest,
  abi: Abi,
): Decoding | undefined {
  const callParams = getContractCallParams(request);
  if (!callParams?.data) {
    return undefined;
  }
  return decodeCall(abi, callParams.data, getReturnData(request));
}
