import { describe, expect, it } from "vitest";
import {
  Abi,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  getAddress,
  Hex,
  parseAbi,
  parseAbiParameters,
  toFunctionSelector,
} from "viem";
import {
  findBuiltInContract,
  getInnerCalls,
  getResultCountMismatch,
} from "./multicall.ts";
import { RpcRequest } from "../types/main.ts";
import { getMethodCategory } from "../capture/getMethodCategory.ts";
import { Contract } from "../dal/contract.ts";

// The aggregators as deployed, written out here independently of the module
const multicall3Abi = parseAbi([
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

const erc20Abi = [
  {
    type: "error",
    name: "InsufficientBalance",
    inputs: [{ name: "required", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const satisfies Abi;

const MULTICALL = "0xca11bde05977b3631167028862be2a173976ca11";
const TOKEN = "0x00000000000000000000000000000000000000aa";
const OTHER = "0x00000000000000000000000000000000000000bb";
const HOLDER = "0x0000000000000000000000000000000000000001";
const BLOCK_HASH = `0x${"ab".repeat(32)}` as Hex;

const balanceOf = encodeFunctionData({
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [HOLDER],
});
// Selector 0x12345678 with one argument nobody has an ABI for
const UNKNOWN_CALLDATA = `0x12345678${"0".repeat(63)}1` as Hex;
const balance = (value: bigint) =>
  encodeFunctionResult({
    abi: erc20Abi,
    functionName: "balanceOf",
    result: value,
  });

// What aggregate3, aggregate3Value and tryAggregate return
const encodeResults = (results: { success: boolean; returnData: Hex }[]): Hex =>
  encodeAbiParameters(
    parseAbiParameters("(bool success, bytes returnData)[]"),
    [results],
  );

const usdc: Contract = { address: TOKEN, name: "USDC", abi: erc20Abi };
const findContract = (address: `0x${string}`) =>
  address.toLowerCase() === TOKEN ? usdc : undefined;

const rpcRequest = (
  method: string,
  data: Hex,
  result?: unknown,
): RpcRequest => ({
  id: "1",
  url: "https://rpc.example",
  methodCategory: getMethodCategory(method),
  startedDateTime: "2026-01-01T00:00:00.000Z",
  time: 10,
  httpStatus: 200,
  hasRpcResponseBody: result !== undefined,
  requestBody: {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: [{ to: MULTICALL, data }, "latest"],
  },
  response:
    result === undefined ? undefined : { jsonrpc: "2.0", id: 1, result },
});

// The Inner Call to TOKEN, decoded with USDC's ABI
const decodedBalanceOf = (returned?: bigint) => ({
  target: getAddress(TOKEN),
  callData: balanceOf,
  contractName: "USDC",
  decoding: {
    status: "decoded",
    functionName: "balanceOf",
    signature: "balanceOf(address account)",
    args: [{ name: "account", type: "address", value: HOLDER }],
    ...(returned !== undefined && {
      returnValues: [{ name: "balance", type: "uint256", value: returned }],
    }),
  },
});

const unknownCall = {
  target: getAddress(OTHER),
  callData: UNKNOWN_CALLDATA,
  contractName: undefined,
  decoding: undefined,
};

describe("findBuiltInContract", () => {
  it.each([
    ["aggregate", "0x252dba42"],
    ["aggregate3", "0x82ad56cb"],
    ["aggregate3Value", "0x174dea71"],
    ["tryAggregate", "0xbce38bd7"],
    ["tryBlockAndAggregate", "0x399542e9"],
    ["blockAndAggregate", "0xc3077fa9"],
  ])("recognises %s by its Selector %s", (name, selector) => {
    const fn = multicall3Abi.find(
      (item) => item.type === "function" && item.name === name,
    );
    expect(fn && toFunctionSelector(fn)).toBe(selector);

    const contract = findBuiltInContract(`${selector}00` as Hex);
    expect(contract?.name).toBe("Multicall3");
  });

  it("recognises nothing else", () => {
    expect(findBuiltInContract(balanceOf)).toBeUndefined();
    expect(findBuiltInContract(undefined)).toBeUndefined();
  });
});

describe("getInnerCalls", () => {
  it("is undefined for an RPC Request that is not a Multicall", () => {
    expect(
      getInnerCalls(rpcRequest("eth_call", balanceOf), findContract),
    ).toBeUndefined();
  });

  it("aggregate3: decodes each Inner Call and pairs it with its result, marking a failure", () => {
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [
        [
          { target: TOKEN, allowFailure: true, callData: balanceOf },
          { target: OTHER, allowFailure: true, callData: UNKNOWN_CALLDATA },
        ],
      ],
    });
    const result = encodeResults([
      { success: true, returnData: balance(1000n) },
      { success: false, returnData: "0x" },
    ]);

    expect(
      getInnerCalls(rpcRequest("eth_call", data, result), findContract),
    ).toEqual([
      { ...decodedBalanceOf(1000n), success: true, returnData: balance(1000n) },
      { ...unknownCall, success: false, returnData: "0x" },
    ]);
  });

  it("aggregate3Value: Inner Calls carry their value", () => {
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3Value",
      args: [
        [
          {
            target: TOKEN,
            allowFailure: false,
            value: 5n,
            callData: balanceOf,
          },
        ],
      ],
    });
    const result = encodeResults([{ success: true, returnData: balance(7n) }]);

    expect(
      getInnerCalls(rpcRequest("eth_call", data, result), findContract),
    ).toEqual([
      {
        ...decodedBalanceOf(7n),
        value: 5n,
        success: true,
        returnData: balance(7n),
      },
    ]);
  });

  it("aggregate: pairs results, without a success flag", () => {
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate",
      args: [
        [
          { target: TOKEN, callData: balanceOf },
          { target: OTHER, callData: UNKNOWN_CALLDATA },
        ],
      ],
    });
    const result = encodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate",
      result: [19n, [balance(3n), "0x01"]],
    });

    expect(
      getInnerCalls(rpcRequest("eth_call", data, result), findContract),
    ).toEqual([
      { ...decodedBalanceOf(3n), returnData: balance(3n) },
      { ...unknownCall, returnData: "0x01" },
    ]);
  });

  it("tryAggregate: marks a failed Inner Call and leaves its return data undecoded", () => {
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "tryAggregate",
      args: [false, [{ target: TOKEN, callData: balanceOf }]],
    });
    const result = encodeResults([{ success: false, returnData: "0x" }]);

    expect(
      getInnerCalls(rpcRequest("eth_call", data, result), findContract),
    ).toEqual([{ ...decodedBalanceOf(), success: false, returnData: "0x" }]);
  });

  it("tryBlockAndAggregate: pairs results with their success flag", () => {
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "tryBlockAndAggregate",
      args: [false, [{ target: TOKEN, callData: balanceOf }]],
    });
    const result = encodeFunctionResult({
      abi: multicall3Abi,
      functionName: "tryBlockAndAggregate",
      result: [19n, BLOCK_HASH, [{ success: true, returnData: balance(2n) }]],
    });

    expect(
      getInnerCalls(rpcRequest("eth_call", data, result), findContract),
    ).toEqual([
      { ...decodedBalanceOf(2n), success: true, returnData: balance(2n) },
    ]);
  });

  it("blockAndAggregate: pairs results, without a success flag", () => {
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "blockAndAggregate",
      args: [[{ target: TOKEN, callData: balanceOf }]],
    });
    const result = encodeFunctionResult({
      abi: multicall3Abi,
      functionName: "blockAndAggregate",
      result: [19n, BLOCK_HASH, [{ success: true, returnData: balance(4n) }]],
    });

    expect(
      getInnerCalls(rpcRequest("eth_call", data, result), findContract),
    ).toEqual([{ ...decodedBalanceOf(4n), returnData: balance(4n) }]);
  });

  it("eth_estimateGas: Inner Calls without results", () => {
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [[{ target: TOKEN, allowFailure: true, callData: balanceOf }]],
    });

    expect(
      getInnerCalls(
        rpcRequest("eth_estimateGas", data, "0x5208"),
        findContract,
      ),
    ).toEqual([decodedBalanceOf()]);
  });

  it("a reverted Multicall: Inner Calls without results", () => {
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate",
      args: [[{ target: TOKEN, callData: balanceOf }]],
    });
    const request = rpcRequest("eth_call", data);
    request.response = {
      jsonrpc: "2.0",
      id: 1,
      error: { code: 3, message: "execution reverted" },
    };

    expect(getInnerCalls(request, findContract)).toEqual([decodedBalanceOf()]);
  });

  it("a nested Multicall is decoded as a plain aggregator call, not unpacked", () => {
    const nested = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate",
      args: [[{ target: TOKEN, callData: balanceOf }]],
    });
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [[{ target: MULTICALL, allowFailure: false, callData: nested }]],
    });

    const [inner] = getInnerCalls(rpcRequest("eth_call", data), findContract)!;
    expect(inner).toMatchObject({
      target: getAddress(MULTICALL),
      contractName: "Multicall3",
      decoding: { status: "decoded", functionName: "aggregate" },
    });
    expect(inner).not.toHaveProperty("innerCalls");
  });

  it("a user Contract at the target wins over the built-in aggregator ABI", () => {
    const nested = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate",
      args: [[]],
    });
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [[{ target: TOKEN, allowFailure: false, callData: nested }]],
    });

    expect(
      getInnerCalls(rpcRequest("eth_call", data), findContract)?.[0],
    ).toMatchObject({ contractName: "USDC", decoding: { status: "mismatch" } });
  });

  it("calldata that does not decode as the aggregator is not a Multicall", () => {
    expect(
      getInnerCalls(rpcRequest("eth_call", "0x82ad56cb1234"), findContract),
    ).toBeUndefined();
  });
  it("a failed Inner Call carries its revert, decoded with its target's Contract", () => {
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [
        [
          { target: TOKEN, allowFailure: true, callData: balanceOf },
          { target: OTHER, allowFailure: true, callData: UNKNOWN_CALLDATA },
          { target: OTHER, allowFailure: true, callData: UNKNOWN_CALLDATA },
        ],
      ],
    });
    const custom = encodeErrorResult({
      abi: erc20Abi,
      errorName: "InsufficientBalance",
      args: [9n],
    });
    const message = encodeErrorResult({
      abi: parseAbi(["error Error(string)"]),
      errorName: "Error",
      args: ["Not allowed"],
    });
    const result = encodeResults([
      { success: false, returnData: custom },
      { success: false, returnData: message },
      // Without the Contract that declares it, a custom error stays raw
      { success: false, returnData: custom },
    ]);

    expect(
      getInnerCalls(rpcRequest("eth_call", data, result), findContract),
    ).toEqual([
      {
        ...decodedBalanceOf(),
        success: false,
        returnData: custom,
        revert: {
          kind: "custom",
          name: "InsufficientBalance",
          args: [{ name: "required", type: "uint256", value: 9n }],
        },
      },
      {
        ...unknownCall,
        success: false,
        returnData: message,
        revert: { kind: "error", message: "Not allowed" },
      },
      {
        ...unknownCall,
        success: false,
        returnData: custom,
        revert: { kind: "raw", data: custom },
      },
    ]);
  });

  it("a result count that differs from the Inner Calls' pairs nothing", () => {
    const data = encodeFunctionData({
      abi: multicall3Abi,
      functionName: "aggregate3",
      args: [
        [
          { target: TOKEN, allowFailure: true, callData: balanceOf },
          { target: OTHER, allowFailure: true, callData: UNKNOWN_CALLDATA },
        ],
      ],
    });
    const result = encodeResults([{ success: true, returnData: balance(1n) }]);

    expect(
      getInnerCalls(rpcRequest("eth_call", data, result), findContract),
    ).toEqual([decodedBalanceOf(), unknownCall]);
  });
});

describe("getResultCountMismatch", () => {
  const data = encodeFunctionData({
    abi: multicall3Abi,
    functionName: "aggregate3",
    args: [
      [
        { target: TOKEN, allowFailure: true, callData: balanceOf },
        { target: OTHER, allowFailure: true, callData: UNKNOWN_CALLDATA },
      ],
    ],
  });

  it("counts the results and the Inner Calls when they differ", () => {
    const result = encodeResults([{ success: true, returnData: balance(1n) }]);
    expect(
      getResultCountMismatch(rpcRequest("eth_call", data, result)),
    ).toEqual({ resultCount: 1, innerCallCount: 2 });
  });

  it("is nothing when the counts match", () => {
    const result = encodeResults([
      { success: true, returnData: balance(1n) },
      { success: false, returnData: "0x" },
    ]);
    expect(
      getResultCountMismatch(rpcRequest("eth_call", data, result)),
    ).toBeUndefined();
  });

  it("is nothing without decoded results or for another RPC Request", () => {
    expect(
      getResultCountMismatch(rpcRequest("eth_call", data)),
    ).toBeUndefined();
    expect(
      getResultCountMismatch(rpcRequest("eth_call", data, "0x1234")),
    ).toBeUndefined();
    expect(
      getResultCountMismatch(rpcRequest("eth_call", balanceOf, balance(1n))),
    ).toBeUndefined();
  });
});
