import { describe, expect, it } from "vitest";
import {
  CallLineInput,
  formatBatchPosition,
  formatOverviewChain,
  formatOverviewStatus,
  getCallLine,
  getChainMethodCallLine,
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

  it("shows eth_estimateGas's gas after the decoded call", () => {
    expect(
      text(
        getCallLine({
          ...balanceOf,
          decoding: { ...balanceOf.decoding!, returnValues: undefined },
          result: "51,234 gas",
        } as CallLineInput),
      ),
    ).toBe("balanceOf(account: 0xd8dA…6045) → 51,234 gas");
    expect(
      text(
        getCallLine({
          ...balanceOf,
          decoding: undefined,
          hasContract: false,
          result: "51,234 gas",
        }),
      ),
    ).toBe("0x70a08231 · no ABI → 51,234 gas");
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

describe("getChainMethodCallLine", () => {
  const getBalance = {
    method: "eth_getBalance",
    params: [HOLDER, "latest"],
    result: "0x2386f26fc10000",
    chainId: 1,
    failed: false,
  };

  it("is the method with its params and the main value of its result", () => {
    expect(getChainMethodCallLine(getBalance)).toEqual([
      { text: "eth_getBalance(0xd8dA…6045, latest) → 0.01 ETH" },
    ]);
    expect(
      text(
        getChainMethodCallLine({
          ...getBalance,
          method: "eth_blockNumber",
          params: [],
          result: "0x1312d00",
        }),
      ),
    ).toBe("eth_blockNumber() → 20,000,000");
  });

  it("shortens an address in the result", () => {
    expect(
      text(
        getChainMethodCallLine({
          ...getBalance,
          method: "eth_getCode",
          result: `0xef0100${HOLDER.slice(2)}`,
        }),
      ),
    ).toBe("eth_getCode(0xd8dA…6045, latest) → Delegated to 0xd8dA…6045");
  });

  it("has no result before the RPC Response and ✗ when it failed", () => {
    expect(
      text(getChainMethodCallLine({ ...getBalance, result: undefined })),
    ).toBe("eth_getBalance(0xd8dA…6045, latest)");
    expect(getChainMethodCallLine({ ...getBalance, failed: true })).toEqual([
      { text: "eth_getBalance(0xd8dA…6045, latest)" },
      { text: " ✗", tone: "failed" },
    ]);
  });

  it("is nothing for another method", () => {
    expect(
      getChainMethodCallLine({ ...getBalance, method: "eth_getLogs" }),
    ).toEqual([]);
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
    ).toEqual([
      {
        text: "error 3: execution reverted — ERC20: transfer amount exceeds balance",
      },
    ]);
  });

  it("leaves out a Revert the message already holds", () => {
    expect(
      formatOverviewStatus(
        { ...error, message: "execution reverted: Not enough" },
        { kind: "error", message: "Not enough" },
      ),
    ).toEqual([{ text: "error 3: execution reverted: Not enough" }]);
  });

  it("leaves out revert data nothing decodes", () => {
    expect(
      formatOverviewStatus(error, { kind: "raw", data: "0x1234" }),
    ).toEqual([{ text: "error 3: execution reverted" }]);
    expect(formatOverviewStatus(error)).toEqual([
      { text: "error 3: execution reverted" },
    ]);
  });

  it("names the other Contract whose ABI decoded the Revert, muted", () => {
    expect(
      formatOverviewStatus(error, {
        kind: "custom",
        name: "InsufficientLiquidity",
        signature: "InsufficientLiquidity()",
        args: [],
        from: "UniswapV2Pair",
      }),
    ).toEqual([
      { text: "error 3: execution reverted — InsufficientLiquidity()" },
      { text: " from UniswapV2Pair", tone: "muted" },
    ]);
    expect(
      formatOverviewStatus(
        { ...error, message: "execution reverted: InsufficientLiquidity()" },
        {
          kind: "custom",
          name: "InsufficientLiquidity",
          signature: "InsufficientLiquidity()",
          args: [],
          from: "UniswapV2Pair",
        },
      ),
    ).toEqual([
      { text: "error 3: execution reverted: InsufficientLiquidity()" },
      { text: " from UniswapV2Pair", tone: "muted" },
    ]);
  });

  it("is the label for any other Status", () => {
    expect(formatOverviewStatus({ kind: "ok" })).toEqual([{ text: "ok" }]);
    expect(formatOverviewStatus({ kind: "http", code: 502 })).toEqual([
      { text: "HTTP 502" },
    ]);
  });
});

describe("formatBatchPosition", () => {
  it("is the position and the Batch's size", () => {
    expect(formatBatchPosition({ index: 3, size: 12 })).toBe("3 of 12");
  });
});
