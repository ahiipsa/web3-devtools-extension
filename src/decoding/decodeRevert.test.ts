import { describe, expect, it } from "vitest";
import { Abi, encodeErrorResult, parseAbi } from "viem";
import { decodeRevert, getRpcRequestRevert } from "./decodeRevert.ts";
import { RpcRequest } from "../types/main.ts";

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
