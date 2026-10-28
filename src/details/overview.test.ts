import { describe, expect, it } from "vitest";
import {
  CallLineInput,
  formatBatchPosition,
  formatOverviewChain,
  formatOverviewStatus,
  getCallLine,
  OverviewSegment,
} from "./overview.ts";
import { InnerCall } from "../decoding/multicall.ts";

const HOLDER = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
const BALANCE_OF = `0x70A08231${"0".repeat(64)}` as const;

const balanceOf: CallLineInput = {
  data: BALANCE_OF,
  decoding: {
    status: "decoded",
    functionName: "balanceOf",
    signature: "balanceOf(address account)",
    args: [{ name: "account", type: "address", value: HOLDER }],
    returnValues: [{ name: "", type: "uint256", value: 1500000n }],
  },
  innerCalls: undefined,
  hasContract: true,
  contractPending: false,
  failed: false,
};

const text = (segments: OverviewSegment[]) =>
  segments.map((segment) => segment.text).join("");

describe("getCallLine", () => {
  it("is the decoded call with a short address and its result", () => {
    expect(getCallLine(balanceOf)).toEqual([
      { text: "balanceOf(account: 0xd8dA…6045) → 1500000" },
    ]);
  });

  it("has no result without return values", () => {
    expect(
      text(
        getCallLine({
          ...balanceOf,
          decoding: { ...balanceOf.decoding!, returnValues: undefined },
        } as CallLineInput),
      ),
    ).toBe("balanceOf(account: 0xd8dA…6045)");
  });

  it("marks a failed call with ✗ in red", () => {
    expect(
      getCallLine({
        ...balanceOf,
        decoding: { ...balanceOf.decoding!, returnValues: undefined },
        failed: true,
      } as CallLineInput),
    ).toEqual([
      { text: "balanceOf(account: 0xd8dA…6045)" },
      { text: " ✗", tone: "failed" },
    ]);
  });

  it("is the Selector and no ABI, muted, without a Contract", () => {
    expect(
      getCallLine({ ...balanceOf, decoding: undefined, hasContract: false }),
    ).toEqual([{ text: "0x70a08231 · no ABI", tone: "muted" }]);
  });

  it("says when the Contract's ABI does not match", () => {
    expect(
      text(getCallLine({ ...balanceOf, decoding: { status: "mismatch" } })),
    ).toBe("0x70a08231 · ABI does not match");
  });

  it("is the Selector alone while the Contract is being read", () => {
    expect(
      text(
        getCallLine({
          ...balanceOf,
          decoding: undefined,
          hasContract: false,
          contractPending: true,
        }),
      ),
    ).toBe("0x70a08231");
  });

  it("is nothing without calldata or with less than a Selector", () => {
    expect(getCallLine({ ...balanceOf, data: undefined })).toEqual([]);
    expect(getCallLine({ ...balanceOf, data: "0x" })).toEqual([]);
  });

  it("keeps structs and arrays on one line with short addresses", () => {
    expect(
      text(
        getCallLine({
          ...balanceOf,
          decoding: {
            status: "decoded",
            functionName: "swap",
            signature: "swap(…)",
            args: [
              {
                name: "params",
                type: "tuple",
                value: { tokenIn: HOLDER, amount: 5n },
              },
              { name: "path", type: "address[]", value: [HOLDER] },
            ],
          },
        }),
      ),
    ).toBe(
      'swap(params: { "tokenIn": "0xd8dA…6045", "amount": 5 }, path: [0xd8dA…6045])',
    );
  });

  describe("for a Multicall", () => {
    const innerCall: InnerCall = { target: HOLDER, callData: BALANCE_OF };
    const multicall = (innerCalls: InnerCall[]): CallLineInput => ({
      ...balanceOf,
      decoding: {
        status: "decoded",
        functionName: "aggregate3",
        signature: "aggregate3(…)",
        args: [],
      },
      innerCalls,
    });

    it("counts the Inner Calls and the failed ones in red", () => {
      expect(
        getCallLine(
          multicall([
            { ...innerCall, success: true },
            { ...innerCall, success: false },
            { ...innerCall, success: true },
          ]),
        ),
      ).toEqual([
        { text: "aggregate3 · 3 Inner Calls" },
        { text: ", " },
        { text: "1 failed", tone: "failed" },
      ]);
    });

    it("leaves the failed count out when none failed", () => {
      expect(text(getCallLine(multicall([innerCall])))).toBe(
        "aggregate3 · 1 Inner Call",
      );
    });
  });
});

describe("formatOverviewChain", () => {
  it("is the name and chain id, or the chain id alone", () => {
    expect(formatOverviewChain({ kind: "known", chainId: 8453 })).toEqual({
      text: "Base · 8453",
    });
    expect(formatOverviewChain({ kind: "known", chainId: 999999 })).toEqual({
      text: "999999",
    });
  });

  it("is muted while unknown", () => {
    expect(formatOverviewChain({ kind: "looking-up" }).tone).toBe("muted");
    expect(
      formatOverviewChain({ kind: "failed", reason: "eth_chainId failed" }),
    ).toEqual({ text: "unknown: eth_chainId failed", tone: "muted" });
  });
});

describe("formatOverviewStatus", () => {
  const error = {
    kind: "error",
    code: 3,
    message: "execution reverted",
  } as const;

  it("adds a decoded Revert to an RPC error", () => {
    expect(
      formatOverviewStatus(error, {
        kind: "error",
        message: "ERC20: transfer amount exceeds balance",
      }),
    ).toBe(
      "error 3: execution reverted — ERC20: transfer amount exceeds balance",
    );
  });

  it("leaves out a Revert the message already holds", () => {
    expect(
      formatOverviewStatus(
        { ...error, message: "execution reverted: Not enough" },
        { kind: "error", message: "Not enough" },
      ),
    ).toBe("error 3: execution reverted: Not enough");
  });

  it("leaves out revert data nothing decodes", () => {
    expect(formatOverviewStatus(error, { kind: "raw", data: "0x1234" })).toBe(
      "error 3: execution reverted",
    );
    expect(formatOverviewStatus(error)).toBe("error 3: execution reverted");
  });

  it("is the label for any other Status", () => {
    expect(formatOverviewStatus({ kind: "ok" })).toBe("ok");
    expect(formatOverviewStatus({ kind: "http", code: 502 })).toBe("HTTP 502");
  });
});

describe("formatBatchPosition", () => {
  it("is the position and the Batch's size", () => {
    expect(formatBatchPosition({ index: 3, size: 12 })).toBe("3 of 12");
  });
});
