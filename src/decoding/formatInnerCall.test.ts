import { describe, expect, it } from "vitest";
import {
  formatInnerCallFunction,
  formatInnerCallResult,
  formatInnerCallTarget,
} from "./formatInnerCall.ts";
import { InnerCall } from "./multicall.ts";

const TARGET = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const HOLDER = "0x28C6c06298d514Db089934071355E5743bf21d60";

const undecoded: InnerCall = {
  target: TARGET,
  callData: `0x70A08231${"0".repeat(64)}`,
};

const decoded: InnerCall = {
  ...undecoded,
  contractName: "USDC",
  decoding: {
    status: "decoded",
    functionName: "balanceOf",
    signature: "balanceOf(address account)",
    args: [{ name: "account", type: "address", value: HOLDER }],
    returnValues: [{ name: "", type: "uint256", value: 1000000n }],
  },
};

describe("formatInnerCallTarget", () => {
  it("names the Contract and its short address", () => {
    expect(formatInnerCallTarget(decoded)).toBe("USDC 0xA0b8...eB48");
  });

  it("is the short address without a Contract", () => {
    expect(formatInnerCallTarget(undecoded)).toBe("0xA0b8...eB48");
  });
});

describe("formatInnerCallFunction", () => {
  it("is the function with its named arguments once decoded", () => {
    expect(formatInnerCallFunction(decoded)).toBe(
      `balanceOf(account: ${HOLDER})`,
    );
  });

  it("leaves unnamed arguments unlabelled", () => {
    expect(
      formatInnerCallFunction({
        ...decoded,
        decoding: {
          status: "decoded",
          functionName: "transfer",
          signature: "transfer(address, uint256)",
          args: [
            { name: "[0]", type: "address", value: HOLDER },
            { name: "[1]", type: "uint256", value: 5n },
          ],
        },
      }),
    ).toBe(`transfer(${HOLDER}, 5)`);
  });

  it("is the lowercase Selector when nothing decodes the calldata", () => {
    expect(formatInnerCallFunction(undecoded)).toBe("0x70a08231");
    expect(
      formatInnerCallFunction({ ...decoded, decoding: { status: "mismatch" } }),
    ).toBe("0x70a08231");
  });
});

describe("formatInnerCallResult", () => {
  it("is a lone return value bare", () => {
    expect(formatInnerCallResult(decoded)).toBe("1000000");
  });

  it("lists several return values by name", () => {
    expect(
      formatInnerCallResult({
        ...decoded,
        decoding: {
          status: "decoded",
          functionName: "getReserves",
          signature: "getReserves()",
          args: [],
          returnValues: [
            { name: "reserve0", type: "uint112", value: 1n },
            { name: "[1]", type: "uint112", value: 2n },
          ],
        },
      }),
    ).toBe("(reserve0: 1, 2)");
  });

  it("is nothing without decoded return values", () => {
    expect(formatInnerCallResult(undecoded)).toBeUndefined();
    expect(
      formatInnerCallResult({
        ...decoded,
        decoding: {
          ...decoded.decoding!,
          returnValues: [],
        } as InnerCall["decoding"],
      }),
    ).toBe("()");
  });
});
