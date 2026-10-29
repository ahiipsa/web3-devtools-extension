import { describe, expect, it } from "vitest";
import {
  formatInnerCallFunction,
  formatInnerCallFunctionName,
  formatInnerCallResult,
  formatResultCountMismatch,
  getInnerCallOutcome,
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

describe("formatInnerCallFunctionName", () => {
  it("is the function's name once decoded, else the lowercase Selector", () => {
    expect(formatInnerCallFunctionName(decoded)).toBe("balanceOf");
    expect(formatInnerCallFunctionName(undecoded)).toBe("0x70a08231");
    expect(
      formatInnerCallFunctionName({
        ...decoded,
        decoding: { status: "mismatch" },
      }),
    ).toBe("0x70a08231");
  });
});

describe("getInnerCallOutcome", () => {
  const RETURNED = `0x${"0".repeat(63)}1` as const;

  it("is the decoded result of a succeeded Inner Call", () => {
    expect(
      getInnerCallOutcome({ ...decoded, success: true, returnData: RETURNED }),
    ).toEqual({ kind: "succeeded", value: "1000000", decoded: true });
    // aggregate reports no success flag: its results are all successes
    expect(getInnerCallOutcome({ ...decoded, returnData: RETURNED })).toEqual({
      kind: "succeeded",
      value: "1000000",
      decoded: true,
    });
  });

  it("is the raw return data when nothing decodes it", () => {
    expect(
      getInnerCallOutcome({
        ...undecoded,
        success: true,
        returnData: RETURNED,
      }),
    ).toEqual({ kind: "succeeded", value: RETURNED, decoded: false });
    expect(
      getInnerCallOutcome({
        ...decoded,
        decoding: {
          ...decoded.decoding!,
          returnValues: undefined,
          returnValueMismatch: true,
        } as InnerCall["decoding"],
        returnData: "0x01",
      }),
    ).toEqual({ kind: "succeeded", value: "0x01", decoded: false });
    expect(
      getInnerCallOutcome({ ...undecoded, success: true, returnData: "0x" }),
    ).toEqual({ kind: "succeeded", value: "0x", decoded: false });
  });

  it("is the Revert of a failed Inner Call", () => {
    expect(
      getInnerCallOutcome({
        ...decoded,
        success: false,
        returnData: RETURNED,
        revert: { kind: "panic", code: 0x11n },
      }),
    ).toEqual({ kind: "failed", revert: "Panic 0x11 (arithmetic overflow)" });
    expect(
      getInnerCallOutcome({ ...decoded, success: false, returnData: "0x" }),
    ).toEqual({ kind: "failed", revert: undefined });
  });

  it("names the other Contract whose ABI decoded a failed Inner Call's Revert", () => {
    expect(
      getInnerCallOutcome({
        ...decoded,
        success: false,
        returnData: RETURNED,
        revert: {
          kind: "custom",
          name: "InsufficientLiquidity",
          signature: "InsufficientLiquidity()",
          args: [],
          from: "UniswapV2Pair",
        },
      }),
    ).toEqual({
      kind: "failed",
      revert: "InsufficientLiquidity()",
      revertSource: "from UniswapV2Pair",
    });
  });

  it("is no result without return data", () => {
    expect(getInnerCallOutcome(decoded)).toEqual({ kind: "none" });
  });
});

describe("formatResultCountMismatch", () => {
  it("counts the results and the Inner Calls", () => {
    expect(
      formatResultCountMismatch({ resultCount: 3, innerCallCount: 2 }),
    ).toBe("The RPC Response has 3 results for 2 Inner Calls");
    expect(
      formatResultCountMismatch({ resultCount: 1, innerCallCount: 1 }),
    ).toBe("The RPC Response has 1 result for 1 Inner Call");
  });
});
