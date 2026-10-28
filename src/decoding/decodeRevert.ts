import { Abi, decodeErrorResult, Hex, isHex } from "viem";
import { RpcRequest } from "../types/main.ts";
import {
  DecodedValue,
  formatSignature,
  labelValues,
} from "./decodeRpcRequest.ts";

// Why a call reverted, from its revert data
export type Revert =
  | { kind: "error"; message: string }
  | { kind: "panic"; code: bigint }
  | { kind: "custom"; name: string; signature: string; args: DecodedValue[] }
  // Revert data nothing decodes
  | { kind: "raw"; data: Hex };

// Error(string) and Panic(uint256)
const ERROR_SELECTOR = "0x08c379a0";
const PANIC_SELECTOR = "0x4e487b71";

// Decodes revert data as Error(string), Panic(uint256) or a custom error the
// ABI declares; nothing for empty revert data
export function decodeRevert(data: Hex, abi?: Abi): Revert | undefined {
  if (data === "0x") {
    return undefined;
  }
  try {
    const { abiItem, errorName, args = [] } = decodeErrorResult({ abi, data });
    // By Selector: an ABI's own error may also be named Error or Panic
    const selector = data.slice(0, 10).toLowerCase();
    if (selector === ERROR_SELECTOR) {
      return { kind: "error", message: String(args[0]) };
    }
    if (selector === PANIC_SELECTOR) {
      return { kind: "panic", code: args[0] as bigint };
    }
    const inputs = "inputs" in abiItem ? abiItem.inputs : [];
    return {
      kind: "custom",
      name: errorName,
      signature: formatSignature({ name: errorName, inputs }),
      args: labelValues(inputs, args),
    };
  } catch {
    return { kind: "raw", data };
  }
}

// The revert data of an RPC error: its `data`, or the `data` nested in it as
// some nodes send it
const getRevertData = (data: unknown): Hex | undefined => {
  const nested =
    typeof data === "object" && data !== null && "data" in data
      ? data.data
      : data;
  return typeof nested === "string" && isHex(nested) ? nested : undefined;
};

// Why an RPC Request reverted, from the revert data its RPC error carries;
// nothing for an RPC Request without an RPC error or revert data
export function getRpcRequestRevert(
  request: RpcRequest,
  abi?: Abi,
): Revert | undefined {
  const data = getRevertData(request.response?.error?.data);
  return data && decodeRevert(data, abi);
}
