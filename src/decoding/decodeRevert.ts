import { Abi, decodeErrorResult, Hex } from "viem";
import { DecodedValue, labelValues } from "./decodeRpcRequest.ts";

// Why a call reverted, from its revert data
export type Revert =
  | { kind: "error"; message: string }
  | { kind: "panic"; code: bigint }
  | { kind: "custom"; name: string; args: DecodedValue[] }
  // Revert data nothing decodes
  | { kind: "raw"; data: Hex };

// Decodes revert data as Error(string), Panic(uint256) or a custom error the
// ABI declares; nothing for empty revert data
export function decodeRevert(data: Hex, abi?: Abi): Revert | undefined {
  if (data === "0x") {
    return undefined;
  }
  try {
    const { abiItem, errorName, args = [] } = decodeErrorResult({ abi, data });
    if (errorName === "Error") {
      return { kind: "error", message: String(args[0]) };
    }
    if (errorName === "Panic") {
      return { kind: "panic", code: args[0] as bigint };
    }
    return {
      kind: "custom",
      name: errorName,
      args: labelValues("inputs" in abiItem ? abiItem.inputs : [], args),
    };
  } catch {
    return { kind: "raw", data };
  }
}
