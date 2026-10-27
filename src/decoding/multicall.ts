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

// The ABI that decodes calldata to an address: its Contract's, else the
// built-in aggregator's for a Multicall
export const findDecodingContract = (
  findContract: FindContract,
  address: `0x${string}`,
  data: Hex | undefined,
): BuiltInContract | undefined =>
  findContract(address) ?? findBuiltInContract(data);

// One call bundled in a Multicall
export interface InnerCall {
  target: `0x${string}`;
  callData: Hex;
  // aggregate3Value only
  value?: bigint;
  // The target's Contract, else the built-in aggregator for an Inner Call
  // that is itself a Multicall
  contractName?: string;
  // Undefined when nothing decodes the target's calldata
  decoding?: Decoding;
  // From the aggregator's return data, eth_call only. `success` is set only
  // by functions that report it: in aggregate and blockAndAggregate a failed
  // Inner Call reverts the whole Multicall
  success?: boolean;
  returnData?: Hex;
}

// One call as the aggregator's calldata bundles it
interface AggregatorCall {
  target: `0x${string}`;
  callData: Hex;
  value?: bigint;
}

// One call's outcome as the aggregator returns it
interface AggregatorCallOutcome {
  success?: boolean;
  returnData: Hex;
}

// The aggregator function and its decoded arguments
type AggregatorInput = { functionName: string; args: readonly unknown[] };

// The bundled calls are always the last argument
const getAggregatorCalls = ({ args }: AggregatorInput) =>
  args.at(-1) as readonly AggregatorCall[];

// The aggregator functions with more than one return value
const RETURNS_SEVERAL = new Set([
  "aggregate",
  "tryBlockAndAggregate",
  "blockAndAggregate",
]);

// The per-call results are always the last return value: aggregate's are
// bare bytes, the others' carry a success flag, which blockAndAggregate
// always sets
const getOutcomes = (
  { functionName }: AggregatorInput,
  returnData: Hex,
): AggregatorCallOutcome[] | undefined => {
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

// The aggregator function a Multicall calls; undefined for any other RPC
// Request
const getAggregatorInput = (
  request: RpcRequest,
): AggregatorInput | undefined => {
  const data = getContractCallParams(request)?.data;
  if (!data || !findBuiltInContract(data)) {
    return undefined;
  }
  try {
    return decodeFunctionData({ abi: MULTICALL3_ABI, data });
  } catch {
    return undefined;
  }
};

// The target addresses of a Multicall's Inner Calls, in order and repeated
// as bundled; undefined for any other RPC Request
export const getInnerCallTargets = (
  request: RpcRequest,
): `0x${string}`[] | undefined => {
  const input = getAggregatorInput(request);
  return input && getAggregatorCalls(input).map(({ target }) => target);
};

// The Inner Calls of a Multicall, each decoded with its target's Contract
// and paired with its result; undefined for any other RPC Request
export function getInnerCalls(
  request: RpcRequest,
  findContract: FindContract,
): InnerCall[] | undefined {
  const input = getAggregatorInput(request);
  if (!input) {
    return undefined;
  }

  const calls = getAggregatorCalls(input);
  const returnData = getReturnData(request);
  const outcomes = returnData && getOutcomes(input, returnData);
  // Outcomes pair with Inner Calls by position, so a count that differs pairs nothing
  const paired = outcomes?.length === calls.length ? outcomes : undefined;

  return calls.map(({ target, callData, value }, index) => {
    const result = paired?.[index];
    // An Inner Call that is itself a Multicall decodes as a plain aggregator
    // call, without Inner Calls of its own
    const contract = findDecodingContract(findContract, target, callData);
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
