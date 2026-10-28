import { describe, expect, it } from "vitest";
import {
  formatInnerCallFunction,
  formatInnerCallRawResult,
  formatInnerCallResult,
  formatInnerCallRevert,
  formatResultCountMismatch,
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

describe("formatInnerCallRawResult", () => {
  const RETURNED = `0x${"0".repeat(63)}1` as const;

  it("is the raw return data when nothing decodes it", () => {
    expect(
      formatInnerCallRawResult({ ...undecoded, returnData: RETURNED }),
    ).toBe(RETURNED);
    expect(
      formatInnerCallRawResult({
        ...decoded,
        decoding: { status: "mismatch" },
        returnData: RETURNED,
      }),
    ).toBe(RETURNED);
    expect(
      formatInnerCallRawResult({
        ...decoded,
        decoding: {
          ...decoded.decoding!,
          returnValues: undefined,
          returnValueMismatch: true,
        } as InnerCall["decoding"],
        returnData: "0x01",
      }),
    ).toBe("0x01");
  });

  it("is 0x for empty return data", () => {
    expect(
      formatInnerCallRawResult({
        ...undecoded,
        success: true,
        returnData: "0x",
      }),
    ).toBe("0x");
  });

  it("is nothing once decoded, for a failed Inner Call or without return data", () => {
    expect(
      formatInnerCallRawResult({ ...decoded, returnData: RETURNED }),
    ).toBeUndefined();
    expect(
      formatInnerCallRawResult({
        ...undecoded,
        success: false,
        returnData: RETURNED,
      }),
    ).toBeUndefined();
    expect(formatInnerCallRawResult(undecoded)).toBeUndefined();
  });
});

describe("formatInnerCallRevert", () => {
  const failed = (revert: InnerCall["revert"]): InnerCall => ({
    ...undecoded,
    success: false,
    returnData: "0x",
    revert,
  });

  it("is an Error(string)'s message", () => {
    expect(
      formatInnerCallRevert(failed({ kind: "error", message: "Not allowed" })),
    ).toBe("Not allowed");
  });

  it("names a Panic's code and its reason", () => {
    expect(formatInnerCallRevert(failed({ kind: "panic", code: 0x11n }))).toBe(
      "Panic 0x11 (arithmetic overflow)",
    );
    expect(formatInnerCallRevert(failed({ kind: "panic", code: 0x01n }))).toBe(
      "Panic 0x01 (assertion failed)",
    );
    expect(formatInnerCallRevert(failed({ kind: "panic", code: 0x99n }))).toBe(
      "Panic 0x99",
    );
  });

  it("is a custom error's name with its args", () => {
    expect(
      formatInnerCallRevert(
        failed({
          kind: "custom",
          name: "InsufficientBalance",
          args: [
            { name: "available", type: "uint256", value: 1n },
            { name: "[1]", type: "uint256", value: 2n },
          ],
        }),
      ),
    ).toBe("InsufficientBalance(available: 1, 2)");
  });

  it("is unknown revert data raw", () => {
    expect(
      formatInnerCallRevert(failed({ kind: "raw", data: "0xdeadbeef" })),
    ).toBe("0xdeadbeef");
  });

  it("is nothing without a revert", () => {
    expect(formatInnerCallRevert(failed(undefined))).toBeUndefined();
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
