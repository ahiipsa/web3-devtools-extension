import { Abi, decodeErrorResult, Hex, isHex, toFunctionSelector } from "viem";
import { RpcRequest } from "../types/main.ts";
import { Contract, normalizeAddress } from "../dal/contract.ts";
import { formatContractName } from "../details/formatAddress.ts";
import { getFunctionSelector } from "./selector.ts";
import {
  DecodedValue,
  formatSignature,
  labelValues,
} from "./decodeRpcRequest.ts";

// Why a call reverted, from its revert data
export type Revert =
  | { kind: "error"; message: string }
  | { kind: "panic"; code: bigint }
  | {
      kind: "custom";
      name: string;
      signature: string;
      args: DecodedValue[];
      // The Contract whose ABI decoded it, when not the first ABI tried:
      // an error raised deeper in the call and bubbled up
      from?: string;
    }
  // Revert data nothing decodes
  | { kind: "raw"; data: Hex };

// Error(string) and Panic(uint256)
const ERROR_SELECTOR = "0x08c379a0";
const PANIC_SELECTOR = "0x4e487b71";

// The stored Contracts whose ABIs declare each custom error, by its Selector,
// in store order
export type ErrorIndex = ReadonlyMap<`0x${string}`, readonly Contract[]>;

type AbiError = Extract<Abi[number], { type: "error" }>;

// viem hashes an error's signature as a function's; none for a malformed
// error item
const getErrorSelector = (error: AbiError) => {
  try {
    return toFunctionSelector({
      ...error,
      type: "function",
      stateMutability: "view",
      outputs: [],
    });
  } catch {
    return undefined;
  }
};

// Built once per change of the stored Contracts
export const buildErrorIndex = (contracts: readonly Contract[]): ErrorIndex => {
  const index = new Map<`0x${string}`, Contract[]>();
  for (const contract of contracts) {
    const selectors = new Set(
      contract.abi
        .filter((item): item is AbiError => item.type === "error")
        .map(getErrorSelector),
    );
    for (const selector of selectors) {
      if (selector) {
        index.set(selector, [...(index.get(selector) ?? []), contract]);
      }
    }
  }
  return index;
};

// The other known ABIs a custom error is looked up in when the first ABI
// does not decode it
export interface ErrorLookup {
  index: ErrorIndex;
  // The address whose ABI is the first, not tried again
  address?: `0x${string}`;
  // Tried before the rest, in order: a Multicall's Inner Call targets
  preferred?: readonly `0x${string}`[];
}

// The stored Contracts declaring the error, preferred ones first
const findErrorContracts = (
  selector: `0x${string}`,
  { index, address, preferred = [] }: ErrorLookup,
) => {
  const skip = address && normalizeAddress(address);
  const order = preferred.map(normalizeAddress);
  const rank = (contract: Contract) => {
    const position = order.indexOf(normalizeAddress(contract.address));
    return position === -1 ? order.length : position;
  };
  return (index.get(selector) ?? [])
    .filter((contract) => normalizeAddress(contract.address) !== skip)
    .sort((a, b) => rank(a) - rank(b));
};

// Decodes revert data as Error(string), Panic(uint256) or a custom error the
// ABI declares, else one another known ABI declares; nothing for empty revert
// data
export function decodeRevert(
  data: Hex,
  abi?: Abi,
  lookup?: ErrorLookup,
): Revert | undefined {
  if (data === "0x") {
    return undefined;
  }
  const revert = decodeWithAbi(data, abi);
  const selector = getFunctionSelector(data);
  if (
    revert.kind !== "raw" ||
    !lookup ||
    !selector ||
    selector === ERROR_SELECTOR ||
    selector === PANIC_SELECTOR
  ) {
    return revert;
  }
  // The first ABI whose error decodes by Selector and arguments wins
  for (const contract of findErrorContracts(selector, lookup)) {
    const other = decodeWithAbi(data, contract.abi);
    if (other.kind === "custom") {
      return { ...other, from: formatContractName(contract) };
    }
  }
  return revert;
}

function decodeWithAbi(data: Hex, abi?: Abi): Revert {
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
  lookup?: ErrorLookup,
): Revert | undefined {
  const data = getRevertData(request.response?.error?.data);
  return data && decodeRevert(data, abi, lookup);
}
