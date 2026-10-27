import { describe, expect, it } from "vitest";
import {
  Abi,
  AbiFunction,
  encodeFunctionData,
  encodeFunctionResult,
} from "viem";
import { decodeRpcRequest } from "./decodeRpcRequest.ts";
import { RpcRequest } from "../types/main.ts";
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
  methodCategory: getMethodCategory(method),
  startedDateTime: "2026-01-01T00:00:00.000Z",
  time: 10,
  httpStatus: 200,
  hasRpcResponseBody: result !== undefined,
  requestBody: { jsonrpc: "2.0", id: 1, method, params },
  response:
    result === undefined ? undefined : { jsonrpc: "2.0", id: 1, result },
});

describe("decodeRpcRequest", () => {
  it("decodes an eth_call's arguments and its lone unnamed return value, labelled by type only", () => {
    const request = rpcRequest(
      "eth_call",
      [{ to: TOKEN, data: BALANCE_OF_CALLDATA }, "latest"],
      UINT_1000,
    );

    expect(decodeRpcRequest(request, erc20Abi)).toEqual({
      status: "decoded",
      functionName: "balanceOf",
      signature: "balanceOf(address owner)",
      args: [{ name: "owner", type: "address", value: OWNER }],
      returnValues: [{ name: "", type: "uint256", value: 1000n }],
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
        args: [{ name: "owner", type: "address", value: OWNER }],
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
        args: [{ name: "owner", type: "address", value: OWNER }],
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
      args: [{ name: "owner", type: "address", value: OWNER }],
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

  describe("pairs every value with its ABI name, or its position, and type", () => {
    const abi = [
      {
        type: "function",
        name: "transfer",
        stateMutability: "nonpayable",
        inputs: [
          { name: "", type: "address" },
          { name: "", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
      {
        type: "function",
        name: "totalSupply",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "supply", type: "uint256" }],
      },
      {
        type: "function",
        name: "getReserves",
        stateMutability: "view",
        inputs: [],
        outputs: [
          { name: "reserve0", type: "uint112" },
          { name: "", type: "uint112" },
        ],
      },
      {
        type: "function",
        name: "submit",
        stateMutability: "nonpayable",
        inputs: [
          {
            name: "order",
            type: "tuple",
            components: [
              { name: "maker", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
          { name: "ids", type: "uint256[]" },
        ],
        outputs: [],
      },
      {
        type: "function",
        name: "safeTransferFrom",
        stateMutability: "nonpayable",
        inputs: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "tokenId", type: "uint256" },
        ],
        outputs: [],
      },
      {
        type: "function",
        name: "safeTransferFrom",
        stateMutability: "nonpayable",
        inputs: [
          { name: "from", type: "address" },
          { name: "recipient", type: "address" },
          { name: "id", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
        outputs: [],
      },
    ] as const satisfies Abi;

    const ethCall = (data: `0x${string}`, result?: `0x${string}`) =>
      rpcRequest("eth_call", [{ to: TOKEN, data }, "latest"], result);

    it("falls back to the position of unnamed inputs, and to no name for a lone unnamed output", () => {
      const request = ethCall(
        encodeFunctionData({
          abi,
          functionName: "transfer",
          args: [OWNER, 5n],
        }),
        encodeFunctionResult({
          abi,
          functionName: "transfer",
          result: true,
        }),
      );

      expect(decodeRpcRequest(request, abi)).toEqual({
        status: "decoded",
        functionName: "transfer",
        signature: "transfer(address, uint256)",
        args: [
          { name: "[0]", type: "address", value: OWNER },
          { name: "[1]", type: "uint256", value: 5n },
        ],
        returnValues: [{ name: "", type: "bool", value: true }],
      });
    });

    it("decodes a function with no inputs and a named output", () => {
      const request = ethCall(
        encodeFunctionData({ abi, functionName: "totalSupply" }),
        encodeFunctionResult({
          abi,
          functionName: "totalSupply",
          result: 7n,
        }),
      );

      expect(decodeRpcRequest(request, abi)).toEqual({
        status: "decoded",
        functionName: "totalSupply",
        signature: "totalSupply()",
        args: [],
        returnValues: [{ name: "supply", type: "uint256", value: 7n }],
      });
    });

    it("decodes several outputs, named and unnamed", () => {
      const request = ethCall(
        encodeFunctionData({ abi, functionName: "getReserves" }),
        encodeFunctionResult({
          abi,
          functionName: "getReserves",
          result: [1n, 2n],
        }),
      );

      expect(decodeRpcRequest(request, abi)).toMatchObject({
        returnValues: [
          { name: "reserve0", type: "uint112", value: 1n },
          { name: "[1]", type: "uint112", value: 2n },
        ],
      });
    });

    it("keeps a tuple and an array as one value each", () => {
      const request = ethCall(
        encodeFunctionData({
          abi,
          functionName: "submit",
          args: [{ maker: OWNER, amount: 3n }, [1n, 2n]],
        }),
        "0x",
      );

      expect(decodeRpcRequest(request, abi)).toEqual({
        status: "decoded",
        functionName: "submit",
        signature:
          "submit((address maker, uint256 amount) order, uint256[] ids)",
        args: [
          {
            name: "order",
            type: "tuple",
            value: { maker: OWNER, amount: 3n },
          },
          { name: "ids", type: "uint256[]", value: [1n, 2n] },
        ],
        returnValues: [],
      });
    });

    it.each([
      [
        "a nested tuple with named components",
        [
          {
            name: "order",
            type: "tuple",
            components: [
              { name: "maker", type: "address" },
              {
                name: "fee",
                type: "tuple",
                components: [
                  { name: "recipient", type: "address" },
                  { name: "bps", type: "uint16" },
                ],
              },
            ],
          },
          { name: "deadline", type: "uint256" },
        ],
        [{ maker: OWNER, fee: { recipient: TOKEN, bps: 30 } }, 1n],
        "fill((address maker, (address recipient, uint16 bps) fee) order, uint256 deadline)",
      ],
      [
        "a tuple array",
        [
          {
            name: "calls",
            type: "tuple[]",
            components: [
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
        [[{ to: TOKEN, value: 1n }]],
        "fill((address to, uint256 value)[] calls)",
      ],
      [
        "unnamed components and a fixed array of tuple arrays",
        [
          {
            name: "",
            type: "tuple[2][]",
            components: [
              { name: "", type: "address" },
              {
                name: "",
                type: "tuple[]",
                components: [{ name: "", type: "bytes32" }],
              },
            ],
          },
        ],
        [[]],
        "fill((address, (bytes32)[])[2][])",
      ],
    ] as const)(
      "expands %s into its components in the signature",
      (_label, inputs, args, signature) => {
        const fill = {
          type: "function",
          name: "fill",
          stateMutability: "nonpayable",
          inputs,
          outputs: [],
        } as const satisfies AbiFunction;
        const request = ethCall(
          encodeFunctionData({
            abi: [fill] as AbiFunction[],
            functionName: "fill",
            args: args as readonly unknown[],
          }),
        );

        expect(decodeRpcRequest(request, [fill])).toMatchObject({
          signature,
        });
      },
    );

    it("names the arguments of the overload the calldata was encoded for", () => {
      const request = rpcRequest("eth_sendTransaction", [
        {
          from: OWNER,
          to: TOKEN,
          data: encodeFunctionData({
            abi,
            functionName: "safeTransferFrom",
            args: [OWNER, TOKEN, 9n, "0x"],
          }),
        },
      ]);

      expect(decodeRpcRequest(request, abi)).toMatchObject({
        signature:
          "safeTransferFrom(address from, address recipient, uint256 id, bytes data)",
        args: [
          { name: "from" },
          { name: "recipient" },
          { name: "id" },
          { name: "data" },
        ],
      });
    });
  });
});

describe("decodeRpcRequest with a loosely written ABI", () => {
  it("skips a function it cannot hash and treats missing outputs as none", () => {
    const abi = [
      { type: "function", name: "broken" },
      { type: "function", name: "totalSupply", inputs: [] },
    ] as unknown as Abi;
    const request = rpcRequest(
      "eth_call",
      [{ to: TOKEN, data: "0x18160ddd" }, "latest"],
      "0x",
    );

    expect(decodeRpcRequest(request, abi)).toEqual({
      status: "decoded",
      functionName: "totalSupply",
      signature: "totalSupply()",
      args: [],
      returnValues: [],
    });
  });
});
