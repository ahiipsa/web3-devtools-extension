import { decodeFunctionData, decodeFunctionResult, Hex, parseAbi } from "viem";
import { RpcRequest } from "../types/main.ts";
import { Contract, FindContract } from "../dal/contract.ts";
import { getContractCallParams } from "../utils/requestUtils.ts";
import { findAbiFunction } from "./findAbiFunction.ts";
import { decodeCall, Decoding, getReturnData } from "./decodeRpcRequest.ts";

// Multicall3's aggregator functions; Multicall2's are the same functions
// with the same Selectors
const MULTICALL3_ABI = parseAbi([
  "struct Call { address target; bytes callData; }",
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Call3Value { address target; bool allowFailure; uint256 value; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate(Call[] calls) payable returns (uint256 blockNumber, bytes[] returnData)",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
  "function aggregate3Value(Call3Value[] calls) payable returns (Result[] returnData)",
  "function tryAggregate(bool requireSuccess, Call[] calls) payable returns (Result[] returnData)",
  "function tryBlockAndAggregate(bool requireSuccess, Call[] calls) payable returns (uint256 blockNumber, bytes32 blockHash, Result[] returnData)",
  "function blockAndAggregate(Call[] calls) payable returns (uint256 blockNumber, bytes32 blockHash, Result[] returnData)",
]);

export type BuiltInContract = Pick<Contract, "name" | "abi">;

const MULTICALL3: BuiltInContract = { name: "Multicall3", abi: MULTICALL3_ABI };

// The built-in ABI that decodes calldata to an address without a Contract: a
// Multicall is recognised by its aggregator function's Selector alone
export const findBuiltInContract = (
  data: Hex | undefined,
): BuiltInContract | undefined =>
  data && findAbiFunction(MULTICALL3.abi, data) ? MULTICALL3 : undefined;

// One call bundled in a Multicall
export interface InnerCall {
  target: `0x${string}`;
  callData: Hex;
  // aggregate3Value only
  value?: bigint;
  // The target's Contract, else the built-in aggregator for a nested Multicall
  contractName?: string;
  // Undefined when nothing decodes the target's calldata
  decoding?: Decoding;
  // From the aggregator's return data, eth_call only. `success` is set only
  // by functions that report it: in aggregate and blockAndAggregate a failed
  // Inner Call reverts the whole Multicall
  success?: boolean;
  returnData?: Hex;
}

interface Bundled {
  target: `0x${string}`;
  callData: Hex;
  value?: bigint;
}

interface Returned {
  success?: boolean;
  returnData: Hex;
}

type Aggregated = { functionName: string; args: readonly unknown[] };

// The bundled calls are always the last argument
const getBundled = ({ args }: Aggregated) => args.at(-1) as readonly Bundled[];

const RETURNS_SEVERAL = new Set([
  "aggregate",
  "tryBlockAndAggregate",
  "blockAndAggregate",
]);

// The per-call results are always the last return value: aggregate's are
// bare bytes, the others' carry a success flag, which blockAndAggregate
// always sets
const getReturned = (
  { functionName }: Aggregated,
  returnData: Hex,
): Returned[] | undefined => {
  try {
    const decoded: unknown = decodeFunctionResult({
      abi: MULTICALL3_ABI,
      functionName: functionName as "aggregate",
      data: returnData,
    });
    // viem returns a lone return value bare, several as an array
    const results = (
      RETURNS_SEVERAL.has(functionName)
        ? (decoded as unknown[]).at(-1)
        : decoded
    ) as readonly (Hex | { success: boolean; returnData: Hex })[];
    return results.map((result) =>
      typeof result === "string" || functionName === "blockAndAggregate"
        ? {
            returnData: typeof result === "string" ? result : result.returnData,
          }
        : { success: result.success, returnData: result.returnData },
    );
  } catch {
    return undefined;
  }
};

// The Inner Calls of a Multicall, each decoded with its target's Contract
// and paired with its result; undefined for any other RPC Request
export function getInnerCalls(
  request: RpcRequest,
  findContract: FindContract,
): InnerCall[] | undefined {
  const data = getContractCallParams(request)?.data;
  if (!findBuiltInContract(data)) {
    return undefined;
  }

  let aggregated: Aggregated;
  try {
    aggregated = decodeFunctionData({ abi: MULTICALL3_ABI, data: data! });
  } catch {
    return undefined;
  }

  const bundled = getBundled(aggregated);
  const requestReturnData = getReturnData(request);
  const returned =
    requestReturnData && getReturned(aggregated, requestReturnData);
  // Results pair with Inner Calls by position, so a count that differs pairs nothing
  const results = returned?.length === bundled.length ? returned : undefined;

  return bundled.map(({ target, callData, value }, index) => {
    const result = results?.[index];
    // A nested Multicall decodes as a plain aggregator call
    const contract = findContract(target) ?? findBuiltInContract(callData);
    return {
      target,
      callData,
      ...(value !== undefined && { value }),
      contractName: contract?.name || undefined,
      decoding:
        contract &&
        decodeCall(
          contract.abi,
          callData,
          result && result.success !== false ? result.returnData : undefined,
        ),
      ...result,
    };
  });
}
