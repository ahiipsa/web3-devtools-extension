import { describe, expect, it } from "vitest";
import {
  Abi,
  encodeAbiParameters,
  encodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  parseAbiParameters,
} from "viem";
import {
  buildRpcRequestRow,
  formatDuration,
  getFunctionLabel,
} from "./rpcRequestRow.ts";
import { RpcRequest } from "../types/main.ts";
import { Contract } from "../dal/contract.ts";
import { getMethodCategory } from "../capture/getMethodCategory.ts";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

const TOKEN = "0x00000000000000000000000000000000000000aa";
// balanceOf(0x…01)
const BALANCE_OF_CALLDATA =
  "0x70a082310000000000000000000000000000000000000000000000000000000000000001";

const token: Contract = { address: TOKEN, name: "USDC", abi: erc20Abi };

const rpcRequest = (overrides: Partial<RpcRequest> = {}): RpcRequest => ({
  id: "1",
  url: "https://rpc.example:8545/v1/key?x=1",
  methodCategory: getMethodCategory("eth_call"),
  startedDateTime: "2026-01-01T00:00:00.000Z",
  time: 42.4,
  httpStatus: 200,
  hasRpcResponseBody: true,
  requestBody: {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: TOKEN, data: BALANCE_OF_CALLDATA }, "latest"],
  },
  response: { jsonrpc: "2.0", id: 1, result: "0x" },
  ...overrides,
});

const noContracts = () => undefined;

const ethCall = (data?: string) =>
  rpcRequest({
    requestBody: {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: TOKEN, data }, "latest"],
    },
  });

describe("buildRpcRequestRow", () => {
  it("shows the method, the Endpoint's host and the duration", () => {
    const row = buildRpcRequestRow(rpcRequest(), noContracts);

    expect(row.method).toBe("eth_call");
    expect(row.endpoint).toBe("rpc.example:8545");
    expect(row.time).toBe(42.4);
  });

  it("names a built-in Chain, with its chain id in the tooltip", () => {
    const row = buildRpcRequestRow(rpcRequest(), noContracts, {
      kind: "known",
      chainId: 8453,
    });

    expect(row.chainLabel).toBe("Base");
    expect(row.chainTitle).toBe("Chain 8453");
  });

  it("gives any other Chain as its chain id", () => {
    const row = buildRpcRequestRow(rpcRequest(), noContracts, {
      kind: "known",
      chainId: 123456,
    });

    expect(row.chainLabel).toBe("123456");
    expect(row.chainTitle).toBe("Chain 123456");
    expect(row.chainName).toBeUndefined();
  });

  it("leaves the Chain empty while it is looked up", () => {
    const row = buildRpcRequestRow(rpcRequest(), noContracts, {
      kind: "looking-up",
    });

    expect(row.chainLabel).toBeUndefined();
    expect(row.chainTitle).toBeUndefined();
  });

  it("shows — for a Chain that could not be learnt, with why", () => {
    const row = buildRpcRequestRow(rpcRequest(), noContracts, {
      kind: "failed",
      reason: "no chain id from the Endpoint: HTTP 401",
    });

    expect(row.chainLabel).toBe("—");
    expect(row.chainTitle).toBe("no chain id from the Endpoint: HTTP 401");
  });

  it("names the Contract when it is labelled", () => {
    const row = buildRpcRequestRow(rpcRequest(), () => token);

    expect(row.contractLabel).toBe("USDC");
  });

  it("shortens the address of an unlabelled Contract", () => {
    const row = buildRpcRequestRow(rpcRequest(), noContracts);

    expect(row.contractLabel).toBe("0x0000...00aa");
    expect(row.functionName).toBeUndefined();
  });

  it("has no Contract for an RPC Request that calls none", () => {
    const row = buildRpcRequestRow(
      rpcRequest({
        requestBody: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" },
      }),
      noContracts,
    );

    expect(row.contractLabel).toBeUndefined();
    expect(row.functionName).toBeUndefined();
  });

  it("decodes the function name with the Contract's ABI", () => {
    const row = buildRpcRequestRow(rpcRequest(), () => token);

    expect(row.functionName).toBe("balanceOf");
  });

  it("has no function name when the calldata does not match the ABI", () => {
    const row = buildRpcRequestRow(
      rpcRequest({
        requestBody: {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          // balanceOf's selector with truncated arguments
          params: [{ to: TOKEN, data: "0x70a08231" }, "latest"],
        },
      }),
      () => token,
    );

    expect(row.functionName).toBeUndefined();
  });

  it("shows the selector when no Contract is known for the address", () => {
    const row = buildRpcRequestRow(rpcRequest(), noContracts);

    expect(row.functionSelector).toBe("0x70a08231");
    expect(getFunctionLabel(row)).toEqual({
      text: "0x70a08231",
      decoded: false,
    });
  });

  it("shows the selector when the Contract's ABI does not match it", () => {
    const row = buildRpcRequestRow(
      // transfer(address,uint256), not in the ABI
      ethCall(
        "0xa9059cbb00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002",
      ),
      () => token,
    );

    expect(getFunctionLabel(row)).toEqual({
      text: "0xa9059cbb",
      decoded: false,
    });
  });

  it("shows the function name, not the selector, once decoded", () => {
    const row = buildRpcRequestRow(rpcRequest(), () => token);

    expect(getFunctionLabel(row)).toEqual({ text: "balanceOf", decoded: true });
  });

  it("lowercases the selector", () => {
    const row = buildRpcRequestRow(ethCall("0x70A08231"), noContracts);

    expect(row.functionSelector).toBe("0x70a08231");
  });

  it.each([
    ["no calldata", undefined],
    ["empty calldata", "0x"],
    ["calldata shorter than 4 bytes", "0x70a082"],
    ["calldata that is not hex", "0x70a0823z"],
  ])("shows no function for %s", (_case, data) => {
    const row = buildRpcRequestRow(ethCall(data), noContracts);

    expect(row.functionSelector).toBeUndefined();
    expect(getFunctionLabel(row)).toBeUndefined();
  });

  it("shows no function for an RPC Request that calls no Contract", () => {
    const row = buildRpcRequestRow(
      rpcRequest({
        requestBody: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" },
      }),
      noContracts,
    );

    expect(getFunctionLabel(row)).toBeUndefined();
  });

  it("names a Multicall to an address without a Contract with the built-in aggregator ABI", () => {
    // aggregate3([]) to an unlabelled address
    const data = encodeFunctionData({
      abi: parseAbi([
        "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
      ]),
      functionName: "aggregate3",
      args: [[]],
    });
    const request = rpcRequest({
      requestBody: {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_estimateGas",
        params: [{ to: TOKEN, data }],
      },
    });

    const row = buildRpcRequestRow(request, noContracts);
    expect([row.contractLabel, getFunctionLabel(row)?.text]).toEqual([
      "Multicall3",
      "aggregate3",
    ]);

    // A user Contract's ABI still wins for its address
    const withToken = buildRpcRequestRow(request, () => token);
    expect([
      withToken.contractLabel,
      getFunctionLabel(withToken)?.text,
    ]).toEqual(["USDC", "0x82ad56cb"]);
  });

  it("lists a Multicall's Inner Calls by target, Contract and function, else Selector, flagging failed ones", () => {
    const UNKNOWN = "0x2222222222222222222222222222222222222222";
    const UNKNOWN_CALLDATA = `0x12345678${"0".repeat(64)}` as const;
    const data = encodeFunctionData({
      abi: parseAbi([
        "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
      ]),
      functionName: "aggregate3",
      args: [
        [
          { target: TOKEN, allowFailure: true, callData: BALANCE_OF_CALLDATA },
          { target: UNKNOWN, allowFailure: true, callData: UNKNOWN_CALLDATA },
        ],
      ],
    });
    const result = encodeAbiParameters(
      parseAbiParameters("(bool success, bytes returnData)[]"),
      [
        [
          {
            success: true,
            returnData: encodeFunctionResult({
              abi: erc20Abi,
              functionName: "balanceOf",
              result: 5n,
            }),
          },
          { success: false, returnData: "0x" },
        ],
      ],
    );
    const request = rpcRequest({
      requestBody: {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: "0xca11bde05977b3631167028862be2a173976ca11", data }],
      },
      response: { jsonrpc: "2.0", id: 1, result },
    });

    const row = buildRpcRequestRow(request, (address) =>
      address.toLowerCase() === TOKEN ? token : undefined,
    );

    expect(row.innerCalls).toEqual([
      {
        contractAddress: expect.stringMatching(new RegExp(TOKEN, "i")),
        contractName: "USDC",
        functionName: "balanceOf",
        functionSelector: "0x70a08231",
        failed: false,
      },
      {
        contractAddress: expect.stringMatching(new RegExp(UNKNOWN, "i")),
        contractName: undefined,
        functionName: undefined,
        functionSelector: "0x12345678",
        failed: true,
      },
    ]);
    // A Multicall with failed Inner Calls is still ok
    expect(row.failed).toBe(false);
  });

  it("has no Inner Calls for an RPC Request that is no Multicall", () => {
    expect(
      buildRpcRequestRow(rpcRequest(), () => token).innerCalls,
    ).toBeUndefined();
  });

  it("labels the status and flags anything but ok as failed", () => {
    const ok = buildRpcRequestRow(rpcRequest(), noContracts);
    const rpcError = buildRpcRequestRow(
      rpcRequest({
        response: {
          jsonrpc: "2.0",
          id: 1,
          error: { code: 3, message: "execution reverted" },
        },
      }),
      noContracts,
    );
    const httpError = buildRpcRequestRow(
      rpcRequest({
        response: undefined,
        hasRpcResponseBody: false,
        httpStatus: 429,
      }),
      noContracts,
    );

    expect([ok.status, ok.failed]).toEqual(["ok", false]);
    expect([rpcError.status, rpcError.failed]).toEqual(["error 3", true]);
    expect([httpError.status, httpError.failed]).toEqual(["HTTP 429", true]);
  });

  it.each([
    ["a JSON-RPC body for another id", 500, true, "HTTP 500"],
    ["a text body", 500, false, "HTTP 500"],
    ["an HTML body", 200, false, "no response"],
    ["a JSON-RPC body for another id", 200, true, "no response"],
    ["no HTTP response", 0, false, "failed"],
  ])(
    "flags an RPC Request without its RPC Response as failed: %s, HTTP %i",
    (_body, httpStatus, hasRpcResponseBody, status) => {
      const row = buildRpcRequestRow(
        rpcRequest({ response: undefined, httpStatus, hasRpcResponseBody }),
        noContracts,
      );

      expect([row.status, row.failed]).toEqual([status, true]);
    },
  );

  it("flags an RPC Response with neither a result nor an error as an invalid response", () => {
    const row = buildRpcRequestRow(
      rpcRequest({ response: { jsonrpc: "2.0", id: 1 } }),
      noContracts,
    );

    expect([row.status, row.failed]).toEqual(["invalid response", true]);
  });
});

describe("formatDuration", () => {
  it("shows milliseconds below a second and seconds above", () => {
    expect(formatDuration(42.4)).toBe("42 ms");
    expect(formatDuration(1534)).toBe("1.53 s");
  });
});
