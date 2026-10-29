import { describe, expect, it } from "vitest";
import { Abi, encodeErrorResult, getAddress, parseAbi } from "viem";
import {
  buildErrorIndex,
  decodeRevert,
  getRpcRequestRevert,
} from "./decodeRevert.ts";
import { RpcRequest } from "../types/main.ts";
import { Contract } from "../dal/contract.ts";

const solidityAbi = parseAbi([
  "error Error(string message)",
  "error Panic(uint256 code)",
]);

const tokenAbi = [
  {
    type: "error",
    name: "InsufficientBalance",
    inputs: [
      { name: "available", type: "uint256" },
      { name: "required", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "Unauthorized",
    inputs: [{ name: "", type: "address" }],
  },
] as const satisfies Abi;

const HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";

describe("decodeRevert", () => {
  it("is nothing for empty revert data", () => {
    expect(decodeRevert("0x")).toBeUndefined();
    expect(decodeRevert("0x", tokenAbi)).toBeUndefined();
  });

  it("decodes Error(string) to its message, with or without an ABI", () => {
    const data = encodeErrorResult({
      abi: solidityAbi,
      errorName: "Error",
      args: ["Not allowed"],
    });
    expect(decodeRevert(data)).toEqual({
      kind: "error",
      message: "Not allowed",
    });
    expect(decodeRevert(data, tokenAbi)).toEqual({
      kind: "error",
      message: "Not allowed",
    });
  });

  it("decodes Panic(uint256) to its code", () => {
    const data = encodeErrorResult({
      abi: solidityAbi,
      errorName: "Panic",
      args: [0x11n],
    });
    expect(decodeRevert(data)).toEqual({ kind: "panic", code: 0x11n });
  });

  it("decodes a custom error from the ABI to its name and args", () => {
    expect(
      decodeRevert(
        encodeErrorResult({
          abi: tokenAbi,
          errorName: "InsufficientBalance",
          args: [1n, 2n],
        }),
        tokenAbi,
      ),
    ).toEqual({
      kind: "custom",
      name: "InsufficientBalance",
      signature: "InsufficientBalance(uint256 available, uint256 required)",
      args: [
        { name: "available", type: "uint256", value: 1n },
        { name: "required", type: "uint256", value: 2n },
      ],
    });
    expect(
      decodeRevert(
        encodeErrorResult({
          abi: tokenAbi,
          errorName: "Unauthorized",
          args: [HOLDER],
        }),
        tokenAbi,
      ),
    ).toEqual({
      kind: "custom",
      name: "Unauthorized",
      signature: "Unauthorized(address)",
      args: [{ name: "", type: "address", value: HOLDER }],
    });
  });

  it("decodes an ABI's own error named Panic as a custom error", () => {
    const abi = parseAbi(["error Panic(string reason)"]);
    expect(
      decodeRevert(
        encodeErrorResult({ abi, errorName: "Panic", args: ["oops"] }),
        abi,
      ),
    ).toEqual({
      kind: "custom",
      name: "Panic",
      signature: "Panic(string reason)",
      args: [{ name: "reason", type: "string", value: "oops" }],
    });
  });

  it("keeps revert data nothing decodes raw", () => {
    const custom = encodeErrorResult({
      abi: tokenAbi,
      errorName: "InsufficientBalance",
      args: [1n, 2n],
    });
    // A custom error without the ABI that declares it
    expect(decodeRevert(custom)).toEqual({ kind: "raw", data: custom });
    // Bytes too short for a Selector
    expect(decodeRevert("0x1234", tokenAbi)).toEqual({
      kind: "raw",
      data: "0x1234",
    });
    // An Error(string) Selector with a body that does not decode
    expect(decodeRevert("0x08c379a0ff")).toEqual({
      kind: "raw",
      data: "0x08c379a0ff",
    });
  });
});

describe("decodeRevert with the ABIs of other known Contracts", () => {
  const poolAbi = parseAbi(["error InsufficientLiquidity()"]);
  const ROUTER = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";
  const POOL = "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc";
  const OTHER = "0x0000000000000000000000000000000000000001";
  const pool: Contract = { address: POOL, name: "UniswapV2Pair", abi: poolAbi };
  const insufficientLiquidity = encodeErrorResult({
    abi: poolAbi,
    errorName: "InsufficientLiquidity",
  });

  it("decodes an error only another Contract's ABI declares, with its name", () => {
    const router: Contract = { address: ROUTER, name: "Router", abi: tokenAbi };
    const index = buildErrorIndex([router, pool]);
    expect(
      decodeRevert(insufficientLiquidity, tokenAbi, { index, address: ROUTER }),
    ).toEqual({
      kind: "custom",
      name: "InsufficientLiquidity",
      signature: "InsufficientLiquidity()",
      args: [],
      from: "UniswapV2Pair",
    });
    // Without a Contract at the called address
    expect(decodeRevert(insufficientLiquidity, undefined, { index })).toEqual(
      expect.objectContaining({ from: "UniswapV2Pair" }),
    );
  });

  it("prefers the called Contract's own ABI over another with the same Selector", () => {
    const router: Contract = {
      address: ROUTER,
      name: "Router",
      abi: parseAbi(["error InsufficientLiquidity()"]),
    };
    const index = buildErrorIndex([pool, router]);
    expect(
      decodeRevert(insufficientLiquidity, router.abi, {
        index,
        address: ROUTER,
      }),
    ).toEqual({
      kind: "custom",
      name: "InsufficientLiquidity",
      signature: "InsufficientLiquidity()",
      args: [],
    });
  });

  it("tries the called address's stored Contract first while its own ABI is not at hand", () => {
    const router: Contract = {
      address: ROUTER,
      name: "Router",
      abi: parseAbi(["error InsufficientLiquidity()"]),
    };
    const index = buildErrorIndex([pool, router]);
    // Still loading, or decoded with a built-in ABI
    expect(
      decodeRevert(insufficientLiquidity, undefined, {
        index,
        address: getAddress(ROUTER),
      }),
    ).toEqual({
      kind: "custom",
      name: "InsufficientLiquidity",
      signature: "InsufficientLiquidity()",
      args: [],
    });
  });

  it("prefers an Inner Call target's ABI over an unrelated stored Contract", () => {
    const other: Contract = {
      address: OTHER,
      name: "Other",
      abi: parseAbi(["error InsufficientLiquidity()"]),
    };
    const index = buildErrorIndex([other, pool]);
    expect(
      decodeRevert(insufficientLiquidity, undefined, {
        index,
        // In checksum case, as calldata may carry it
        preferred: [ROUTER, getAddress(POOL)],
      }),
    ).toMatchObject({ from: "UniswapV2Pair" });
    expect(
      decodeRevert(insufficientLiquidity, undefined, { index }),
    ).toMatchObject({ from: "Other" });
  });

  it("skips a Selector match whose arguments do not decode", () => {
    const data = encodeErrorResult({
      abi: tokenAbi,
      errorName: "Unauthorized",
      args: [HOLDER],
    });
    // Same Selector, but only the Selector: no address argument follows
    const truncated = data.slice(0, 10) as `0x${string}`;
    const index = buildErrorIndex([
      { address: OTHER, name: "Token", abi: tokenAbi },
    ]);
    expect(decodeRevert(truncated, undefined, { index })).toEqual({
      kind: "raw",
      data: truncated,
    });
  });

  it("keeps the revert data raw when no known ABI declares the error", () => {
    const index = buildErrorIndex([
      { address: OTHER, name: "Token", abi: tokenAbi },
    ]);
    expect(decodeRevert(insufficientLiquidity, tokenAbi, { index })).toEqual({
      kind: "raw",
      data: insufficientLiquidity,
    });
  });

  it("does not look up an Error(string) that does not decode", () => {
    const index = buildErrorIndex([
      { address: OTHER, name: "Solidity", abi: solidityAbi },
    ]);
    expect(decodeRevert("0x08c379a0ff", undefined, { index })).toEqual({
      kind: "raw",
      data: "0x08c379a0ff",
    });
  });
});

describe("getRpcRequestRevert", () => {
  const message = encodeErrorResult({
    abi: solidityAbi,
    errorName: "Error",
    args: ["Not allowed"],
  });

  const failedRequest = (
    error: NonNullable<RpcRequest["response"]>["error"],
  ): RpcRequest => ({
    id: "1",
    url: "https://rpc.example",
    requestBody: { jsonrpc: "2.0", id: 1, method: "eth_call", params: [] },
    response: { jsonrpc: "2.0", id: 1, error },
    methodCategory: "Calls",
    startedDateTime: "2026-01-01T00:00:00.000Z",
    time: 1,
    httpStatus: 200,
    hasRpcResponseBody: true,
  });

  it("decodes the revert data an RPC error carries", () => {
    expect(
      getRpcRequestRevert(
        failedRequest({
          code: 3,
          message: "execution reverted",
          data: message,
        }),
      ),
    ).toEqual({ kind: "error", message: "Not allowed" });
  });

  it("decodes a custom error with the Contract's ABI", () => {
    const data = encodeErrorResult({
      abi: tokenAbi,
      errorName: "InsufficientBalance",
      args: [1n, 2n],
    });
    expect(
      getRpcRequestRevert(
        failedRequest({ code: 3, message: "execution reverted", data }),
        tokenAbi,
      ),
    ).toMatchObject({ kind: "custom", name: "InsufficientBalance" });
  });

  it("finds revert data nested in the error's data", () => {
    expect(
      getRpcRequestRevert(
        failedRequest({
          code: -32000,
          message: "execution reverted",
          data: { message: "execution reverted", data: message },
        }),
      ),
    ).toEqual({ kind: "error", message: "Not allowed" });
  });

  it("is nothing without hex revert data or an RPC error", () => {
    expect(
      getRpcRequestRevert(
        failedRequest({ code: -32000, message: "nonce too low" }),
      ),
    ).toBeUndefined();
    expect(
      getRpcRequestRevert(
        failedRequest({ code: 3, message: "execution reverted", data: "0x" }),
      ),
    ).toBeUndefined();
    expect(
      getRpcRequestRevert(
        failedRequest({ code: -32000, message: "oops", data: "Reverted" }),
      ),
    ).toBeUndefined();
    expect(
      getRpcRequestRevert({
        ...failedRequest(undefined),
        response: { jsonrpc: "2.0", id: 1, result: message },
      }),
    ).toBeUndefined();
  });
});
