import { describe, expect, it } from "vitest";
import { Abi } from "viem";
import { decodeRpcRequest } from "./decodeRpcRequest.ts";
import { RpcRequest } from "../types/main.ts";

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
const OWNER = "0x0000000000000000000000000000000000000001";
// balanceOf(0x…01)
const BALANCE_OF_CALLDATA =
  "0x70a082310000000000000000000000000000000000000000000000000000000000000001";
// uint256 1000
const UINT_1000 =
  "0x00000000000000000000000000000000000000000000000000000000000003e8";

const rpcRequest = (
  method: string,
  params: unknown,
  result?: unknown,
): RpcRequest => ({
  id: "1",
  url: "https://rpc.example",
  requestBody: { jsonrpc: "2.0", id: 1, method, params },
  response:
    result === undefined ? undefined : { jsonrpc: "2.0", id: 1, result },
});

describe("decodeRpcRequest", () => {
  it("decodes an eth_call's arguments and return value", () => {
    const request = rpcRequest(
      "eth_call",
      [{ to: TOKEN, data: BALANCE_OF_CALLDATA }, "latest"],
      UINT_1000,
    );

    expect(decodeRpcRequest(request, erc20Abi)).toEqual({
      status: "decoded",
      functionName: "balanceOf",
      signature: "balanceOf(address owner)",
      args: [OWNER],
      returnValue: 1000n,
    });
  });

  it.each([
    ["eth_estimateGas", [{ to: TOKEN, data: BALANCE_OF_CALLDATA }], "0x5208"],
    [
      "eth_sendTransaction",
      [{ from: OWNER, to: TOKEN, data: BALANCE_OF_CALLDATA }],
      "0x9caa4aed172f86eb7399c76c2a3e7929d0b8d1b69eba521316b952879b6e9e2b",
    ],
  ])(
    "decodes %s arguments but not its response, which is not a return value",
    (method, params, result) => {
      expect(
        decodeRpcRequest(rpcRequest(method, params, result), erc20Abi),
      ).toEqual({
        status: "decoded",
        functionName: "balanceOf",
        signature: "balanceOf(address owner)",
        args: [OWNER],
      });
    },
  );

  it("reports a mismatch when the Contract's ABI has no function for the calldata", () => {
    const request = rpcRequest("eth_call", [
      // totalSupply()
      { to: TOKEN, data: "0x18160ddd" },
      "latest",
    ]);

    expect(decodeRpcRequest(request, erc20Abi)).toEqual({
      status: "mismatch",
    });
  });

  it.each([
    ["has no RPC Response", undefined],
    [
      "got a JSON-RPC error",
      {
        jsonrpc: "2.0",
        id: 1,
        error: { code: 3, message: "execution reverted" },
      },
    ],
  ] as const)(
    "decodes an eth_call's arguments without a return value when it %s",
    (_label, response) => {
      const request: RpcRequest = {
        ...rpcRequest("eth_call", [
          { to: TOKEN, data: BALANCE_OF_CALLDATA },
          "latest",
        ]),
        response,
      };

      expect(decodeRpcRequest(request, erc20Abi)).toEqual({
        status: "decoded",
        functionName: "balanceOf",
        signature: "balanceOf(address owner)",
        args: [OWNER],
      });
    },
  );

  it("flags an RPC Response that does not match the Contract's ABI instead of throwing", () => {
    const request = rpcRequest(
      "eth_call",
      [{ to: TOKEN, data: BALANCE_OF_CALLDATA }, "latest"],
      "0x",
    );

    expect(decodeRpcRequest(request, erc20Abi)).toEqual({
      status: "decoded",
      functionName: "balanceOf",
      signature: "balanceOf(address owner)",
      args: [OWNER],
      returnValueMismatch: true,
    });
  });

  it.each([
    ["a non-contract method", rpcRequest("eth_blockNumber", [])],
    [
      "a plain value transfer without calldata",
      rpcRequest("eth_sendTransaction", [
        { from: OWNER, to: TOKEN, value: "0x1" },
      ]),
    ],
    ["malformed params", rpcRequest("eth_call", "not-an-array")],
  ])("has nothing to decode for %s", (_label, request) => {
    expect(decodeRpcRequest(request, erc20Abi)).toBeUndefined();
  });

  it("decodes calldata sent in the `input` field", () => {
    const request = rpcRequest("eth_sendTransaction", [
      { from: OWNER, to: TOKEN, input: BALANCE_OF_CALLDATA },
    ]);

    expect(decodeRpcRequest(request, erc20Abi)).toMatchObject({
      status: "decoded",
      functionName: "balanceOf",
    });
  });
});
