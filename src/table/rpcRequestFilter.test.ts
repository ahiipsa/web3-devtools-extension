import { describe, expect, it } from "vitest";
import { Abi } from "viem";
import { buildRpcRequestRow, RpcRequestRow } from "./rpcRequestRow.ts";
import {
  emptyRpcRequestFilter,
  matchesRpcRequestFilter,
  RpcRequestFilter,
  selectMethodCategory,
} from "./rpcRequestFilter.ts";
import { RpcRequest } from "../types/main.ts";
import { Contract } from "../dal/contract.ts";
import { getMethodCategory } from "../capture/getMethodCategory.ts";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

const TOKEN = "0x00000000000000000000000000000000000000aA";
// balanceOf(0x…01)
const BALANCE_OF_CALLDATA =
  "0x70a082310000000000000000000000000000000000000000000000000000000000000001";

const token: Contract = { address: TOKEN, name: "USDC", abi: erc20Abi };

const rpcRequest = (
  method: string,
  overrides: Partial<RpcRequest> = {},
): RpcRequest => ({
  id: "1",
  url: "https://mainnet.infura.io/v3/secret-key",
  methodCategory: getMethodCategory(method),
  startedDateTime: "2026-01-01T00:00:00.000Z",
  time: 10,
  httpStatus: 200,
  hasRpcResponseBody: true,
  requestBody: {
    jsonrpc: "2.0",
    id: 1,
    method,
    params:
      method === "eth_call"
        ? [{ to: TOKEN, data: BALANCE_OF_CALLDATA }, "latest"]
        : [],
  },
  response: { jsonrpc: "2.0", id: 1, result: "0x" },
  ...overrides,
});

const balanceOfRow = buildRpcRequestRow(rpcRequest("eth_call"), () => token);
const blockNumberRow = buildRpcRequestRow(
  rpcRequest("eth_blockNumber"),
  () => undefined,
);

const noFilter = emptyRpcRequestFilter();

const search = (text: string) => ({ ...noFilter, search: text });

describe("matchesRpcRequestFilter", () => {
  it("shows every RPC Request when nothing is filtered", () => {
    expect(matchesRpcRequestFilter(balanceOfRow, noFilter)).toBe(true);
    expect(matchesRpcRequestFilter(blockNumberRow, noFilter)).toBe(true);
  });

  it("searches the method, Endpoint URL, Contract and function, ignoring case", () => {
    for (const text of [
      "ETH_CALL",
      "secret-key",
      "00aa",
      "usdc",
      "BalanceOf",
    ]) {
      expect(matchesRpcRequestFilter(balanceOfRow, search(text))).toBe(true);
    }
    expect(matchesRpcRequestFilter(blockNumberRow, search("usdc"))).toBe(false);
    expect(matchesRpcRequestFilter(balanceOfRow, search("transfer"))).toBe(
      false,
    );
  });

  it("searches the short address the Contract column shows", () => {
    const unlabelledRow = buildRpcRequestRow(
      rpcRequest("eth_call"),
      () => undefined,
    );

    expect(unlabelledRow.contractLabel).toBe("0x0000…00AA");
    for (const text of ["0x0000…00AA", "0x0000…00aa", "0000…00a"]) {
      expect(matchesRpcRequestFilter(unlabelledRow, search(text))).toBe(true);
    }
    expect(
      matchesRpcRequestFilter(
        unlabelledRow,
        search(TOKEN.toUpperCase().replace("0X", "0x")),
      ),
    ).toBe(true);
  });

  it("searches the selector, with or without a Contract for the address", () => {
    const undecodedRow = buildRpcRequestRow(
      rpcRequest("eth_call"),
      () => undefined,
    );

    for (const row of [undecodedRow, balanceOfRow]) {
      expect(matchesRpcRequestFilter(row, search("0x70A08231"))).toBe(true);
      expect(matchesRpcRequestFilter(row, search("70a0"))).toBe(true);
    }
    expect(matchesRpcRequestFilter(undecodedRow, search("a9059cbb"))).toBe(
      false,
    );
  });
});

describe("matchesRpcRequestFilter on a Multicall", () => {
  const multicallRow = {
    ...blockNumberRow,
    method: "eth_call",
    innerCalls: [
      {
        contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        contractName: "WETH9",
        functionName: "balanceOf",
        functionSelector: "0x70a08231",
        failed: false,
      },
      {
        contractAddress: "0x2222222222222222222222222222222222222222",
        functionSelector: "0x12345678",
        failed: true,
      },
    ],
  } satisfies RpcRequestRow;

  it("searches its Inner Calls' Contract name, function and target address", () => {
    for (const text of ["weth9", "BALANCEOF", "0xc02aaa39", "0x12345678"]) {
      expect(matchesRpcRequestFilter(multicallRow, search(text))).toBe(true);
    }
    expect(matchesRpcRequestFilter(multicallRow, search("transfer"))).toBe(
      false,
    );
  });

  it("keeps the Multicall, a single row, in the filtered rows for an Inner Call's function", () => {
    const rows = [blockNumberRow, multicallRow];
    expect(
      rows.filter((row) => matchesRpcRequestFilter(row, search("balanceOf"))),
    ).toEqual([multicallRow]);
  });

  it("is not failed for failed Inner Calls under Errors", () => {
    expect(
      matchesRpcRequestFilter(multicallRow, { ...noFilter, errorsOnly: true }),
    ).toBe(false);
  });
});

describe("matchesRpcRequestFilter by Method Category and errors", () => {
  it("shows only the selected Method Categories", () => {
    const calls = { ...noFilter, methodCategories: ["Calls" as const] };
    const callsAndChain = {
      ...noFilter,
      methodCategories: ["Calls" as const, "Chain" as const],
    };

    expect(matchesRpcRequestFilter(balanceOfRow, calls)).toBe(true);
    expect(matchesRpcRequestFilter(blockNumberRow, calls)).toBe(false);
    expect(matchesRpcRequestFilter(blockNumberRow, callsAndChain)).toBe(true);
  });

  it("shows only RPC Requests whose status is not ok when Errors is on", () => {
    const errors = { ...noFilter, errorsOnly: true };
    const reverted = buildRpcRequestRow(
      rpcRequest("eth_call", {
        response: {
          jsonrpc: "2.0",
          id: 1,
          error: { code: 3, message: "execution reverted" },
        },
      }),
      () => undefined,
    );
    const rateLimited = buildRpcRequestRow(
      rpcRequest("eth_call", {
        response: undefined,
        hasRpcResponseBody: false,
        httpStatus: 429,
      }),
      () => undefined,
    );

    expect(matchesRpcRequestFilter(balanceOfRow, errors)).toBe(false);
    expect(matchesRpcRequestFilter(reverted, errors)).toBe(true);
    expect(matchesRpcRequestFilter(rateLimited, errors)).toBe(true);
  });

  it("combines every filter", () => {
    const filter: RpcRequestFilter = {
      methodCategories: ["Chain"],
      errorsOnly: false,
      search: "usdc",
    };

    expect(matchesRpcRequestFilter(balanceOfRow, filter)).toBe(false);
    expect(matchesRpcRequestFilter(blockNumberRow, filter)).toBe(false);
  });
});

describe("selectMethodCategory", () => {
  it("selects one Method Category on a plain click", () => {
    expect(selectMethodCategory([], "Calls", false)).toEqual(["Calls"]);
    expect(selectMethodCategory(["Calls", "Logs"], "Chain", false)).toEqual([
      "Chain",
    ]);
  });

  it("adds or removes one Method Category on Ctrl/⌘+click", () => {
    expect(selectMethodCategory(["Calls"], "Logs", true)).toEqual([
      "Calls",
      "Logs",
    ]);
    expect(selectMethodCategory(["Calls", "Logs"], "Calls", true)).toEqual([
      "Logs",
    ]);
  });

  it("falls back to All once the last Method Category is removed", () => {
    expect(selectMethodCategory(["Calls"], "Calls", true)).toEqual([]);
  });

  it("resets to All when All is clicked", () => {
    expect(selectMethodCategory(["Calls", "Logs"], "All", false)).toEqual([]);
    expect(selectMethodCategory(["Calls"], "All", true)).toEqual([]);
  });
});

it("keeps an RPC Request nothing answered when Errors is on", () => {
  const unanswered = buildRpcRequestRow(
    rpcRequest("eth_call", { response: undefined }),
    () => undefined,
  );

  expect(
    matchesRpcRequestFilter(unanswered, { ...noFilter, errorsOnly: true }),
  ).toBe(true);
});

describe("matchesRpcRequestFilter by Chain", () => {
  const onBase = buildRpcRequestRow(
    rpcRequest("eth_blockNumber"),
    () => undefined,
    {
      kind: "known",
      chainId: 8453,
    },
  );

  it("matches the Chain's name and its chain id", () => {
    expect(matchesRpcRequestFilter(onBase, search("base"))).toBe(true);
    expect(matchesRpcRequestFilter(onBase, search("8453"))).toBe(true);
    expect(matchesRpcRequestFilter(onBase, search("polygon"))).toBe(false);
    expect(matchesRpcRequestFilter(blockNumberRow, search("base"))).toBe(false);
  });

  it("matches the chain id of a Chain without a name", () => {
    const unnamed = buildRpcRequestRow(
      rpcRequest("eth_blockNumber"),
      () => undefined,
      { kind: "known", chainId: 987654 },
    );

    expect(matchesRpcRequestFilter(unnamed, search("987654"))).toBe(true);
  });
});
