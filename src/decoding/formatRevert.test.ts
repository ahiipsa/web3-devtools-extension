import { describe, expect, it } from "vitest";
import { formatRevert, formatRpcError } from "./formatRevert.ts";

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

describe("formatRpcError", () => {
  it("is the RPC error's code and message", () => {
    expect(formatRpcError({ code: 3, message: "execution reverted" })).toBe(
      "RPC error 3 · execution reverted",
    );
  });
});
