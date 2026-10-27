import { describe, expect, it } from "vitest";
import { Abi, encodeErrorResult, parseAbi } from "viem";
import { decodeRevert } from "./decodeRevert.ts";

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
