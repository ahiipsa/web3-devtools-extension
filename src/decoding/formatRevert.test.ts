import { describe, expect, it } from "vitest";
import { Revert } from "./decodeRevert.ts";
import {
  formatRevert,
  formatRevertSource,
  formatRpcError,
} from "./formatRevert.ts";

describe("formatRevert", () => {
  it("is an Error(string)'s message", () => {
    expect(formatRevert({ kind: "error", message: "Not allowed" })).toBe(
      "Not allowed",
    );
  });

  it("names a Panic's code and its reason", () => {
    expect(formatRevert({ kind: "panic", code: 0x11n })).toBe(
      "Panic 0x11 (arithmetic overflow)",
    );
    expect(formatRevert({ kind: "panic", code: 0x01n })).toBe(
      "Panic 0x01 (assertion failed)",
    );
    expect(formatRevert({ kind: "panic", code: 0x99n })).toBe("Panic 0x99");
  });

  it("is a custom error's name with its args", () => {
    expect(
      formatRevert({
        kind: "custom",
        name: "InsufficientBalance",
        signature: "InsufficientBalance(uint256 available, uint256)",
        args: [
          { name: "available", type: "uint256", value: 1n },
          { name: "[1]", type: "uint256", value: 2n },
        ],
      }),
    ).toBe("InsufficientBalance(available: 1, 2)");
  });

  it("is unknown revert data raw", () => {
    expect(formatRevert({ kind: "raw", data: "0xdeadbeef" })).toBe(
      "0xdeadbeef",
    );
  });
});

describe("formatRevertSource", () => {
  const custom: Revert = {
    kind: "custom",
    name: "InsufficientLiquidity",
    signature: "InsufficientLiquidity()",
    args: [],
  };

  it("names the other Contract whose ABI decoded the error", () => {
    expect(formatRevertSource({ ...custom, from: "UniswapV2Pair" })).toEqual({
      text: "from UniswapV2Pair",
    });
  });

  it("counts the other Contracts that declare the error too, all named in its tooltip", () => {
    expect(
      formatRevertSource({
        ...custom,
        from: "USDC",
        alsoFrom: ["DAI", "WETH9"],
      }),
    ).toEqual({ text: "from USDC +2", title: "Declared by USDC, DAI, WETH9" });
  });

  it("is nothing for a Revert the first ABI decoded", () => {
    expect(formatRevertSource(custom)).toBeUndefined();
    expect(formatRevertSource({ kind: "panic", code: 1n })).toBeUndefined();
  });
});

describe("formatRpcError", () => {
  it("is the RPC error's code and message", () => {
    expect(formatRpcError({ code: 3, message: "execution reverted" })).toBe(
      "RPC error 3 · execution reverted",
    );
  });
});
