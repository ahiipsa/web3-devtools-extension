import { describe, expect, it } from "vitest";
import {
  createTable,
  functionalUpdate,
  TableState,
} from "@tanstack/react-table";
import {
  formatHiddenWithDetails,
  getColumnVisibility,
  rpcRequestTableOptions,
} from "./rpcRequestTable.ts";
import { RpcRequestRow } from "./rpcRequestRow.ts";
import { RpcRequest } from "../types/main.ts";

const row = (
  id: string,
  fields: Partial<Omit<RpcRequestRow, "request">>,
): RpcRequestRow => ({
  request: { id } as RpcRequest,
  method: "eth_call",
  status: "ok",
  failed: false,
  endpoint: "rpc.example",
  time: 10,
  ...fields,
});

// A headless table driven the way the Panel drives it
const buildTable = (data: RpcRequestRow[]) => {
  let state = {} as TableState;
  const table = createTable<RpcRequestRow>({
    ...rpcRequestTableOptions,
    data,
    state,
    onStateChange: () => {},
    renderFallbackValue: null,
  });
  state = table.initialState;
  const onStateChange = (updater: Parameters<typeof functionalUpdate>[0]) => {
    state = functionalUpdate(updater, state) as TableState;
    table.setOptions((prev) => ({ ...prev, state }));
  };
  table.setOptions((prev) => ({ ...prev, state, onStateChange }));
  return table;
};

const order = (table: ReturnType<typeof buildTable>) =>
  table.getRowModel().rows.map((tableRow) => tableRow.original.request.id);

const visibleColumns = (table: ReturnType<typeof buildTable>) =>
  table.getVisibleLeafColumns().map((column) => column.id);

const clickHeader = (table: ReturnType<typeof buildTable>, columnId: string) =>
  table.getColumn(columnId)!.getToggleSortingHandler()!({});

describe("RPC Request table", () => {
  it("has the Network-style columns in order", () => {
    const table = buildTable([]);

    expect(
      table.getAllLeafColumns().map((column) => column.columnDef.header),
    ).toEqual([
      "Method",
      "Chain",
      "Contract",
      "Function",
      "Status",
      "Endpoint",
      "Time",
    ]);
  });

  it("keeps arrival order until a header is clicked", () => {
    const table = buildTable([
      row("1", { method: "eth_chainId" }),
      row("2", { method: "eth_blockNumber" }),
      row("3", { method: "eth_call" }),
    ]);

    expect(order(table)).toEqual(["1", "2", "3"]);
  });

  it("cycles a text column ascending, descending, then back to arrival order", () => {
    const table = buildTable([
      row("1", { method: "eth_chainId" }),
      row("2", { method: "eth_blockNumber" }),
      row("3", { method: "eth_call" }),
    ]);

    clickHeader(table, "method");
    expect(order(table)).toEqual(["2", "3", "1"]);
    clickHeader(table, "method");
    expect(order(table)).toEqual(["1", "3", "2"]);
    clickHeader(table, "method");
    expect(order(table)).toEqual(["1", "2", "3"]);
  });

  it("sorts Time ascending first, by duration", () => {
    const table = buildTable([
      row("1", { time: 300 }),
      row("2", { time: 5 }),
      row("3", { time: 40 }),
    ]);

    clickHeader(table, "time");
    expect(order(table)).toEqual(["2", "3", "1"]);
  });

  it("puts rows without a value last in both directions", () => {
    const table = buildTable([
      row("1", {}),
      row("2", { contractLabel: "WETH" }),
      row("3", { contractLabel: "DAI" }),
    ]);

    clickHeader(table, "contract");
    expect(order(table)).toEqual(["3", "2", "1"]);
    clickHeader(table, "contract");
    expect(order(table)).toEqual(["2", "3", "1"]);
  });

  // alphanumeric puts letters before digits, so selectors follow the names
  it("sorts function names and selectors together", () => {
    const table = buildTable([
      row("1", { functionName: "transfer" }),
      row("2", { functionSelector: "0x70a08231" }),
      row("3", {}),
      row("4", { functionName: "balanceOf", functionSelector: "0xffffffff" }),
    ]);

    clickHeader(table, "function");
    expect(order(table)).toEqual(["4", "1", "2", "3"]);
  });

  it("sorts Chains as text, names before bare chain ids, unknown last", () => {
    const table = buildTable([
      row("1", { chainLabel: "Ethereum" }),
      row("2", {}),
      row("3", { chainLabel: "12345" }),
      row("4", { chainLabel: "Base" }),
    ]);

    clickHeader(table, "chain");
    expect(order(table)).toEqual(["4", "1", "3", "2"]);
    clickHeader(table, "chain");
    expect(order(table)).toEqual(["3", "1", "4", "2"]);
  });

  it("sorts by one column at a time", () => {
    const table = buildTable([
      row("1", { method: "b", time: 1 }),
      row("2", { method: "a", time: 2 }),
    ]);

    clickHeader(table, "method");
    table.getColumn("time")!.getToggleSortingHandler()!({ shiftKey: true });

    expect(table.getState().sorting).toEqual([{ id: "time", desc: false }]);
  });

  it("shows every column with the details closed", () => {
    const table = buildTable([]);
    table.setColumnVisibility(getColumnVisibility(false));

    expect(visibleColumns(table)).toEqual([
      "method",
      "chain",
      "contract",
      "function",
      "status",
      "endpoint",
      "time",
    ]);
  });

  it("keeps only Method with the details open", () => {
    const table = buildTable([]);
    table.setColumnVisibility(getColumnVisibility(true));

    expect(visibleColumns(table)).toEqual(["method"]);
  });
});

describe("formatHiddenWithDetails", () => {
  it("lists the Contract, Function, Status, Endpoint and Time the open details hide", () => {
    expect(
      formatHiddenWithDetails(
        row("1", {
          contractLabel: "USDC",
          functionName: "balanceOf",
          functionSelector: "0x70a08231",
          status: "error 3",
          endpoint: "eth.llamarpc.com",
          time: 1534,
        }),
      ),
    ).toBe(
      "Contract: USDC\nFunction: balanceOf\nStatus: error 3\nEndpoint: eth.llamarpc.com\nTime: 1.53 s",
    );
  });

  it("starts with the Chain once it is known", () => {
    expect(
      formatHiddenWithDetails(
        row("1", { chainLabel: "Base", contractLabel: "USDC" }),
      ),
    ).toBe(
      "Chain: Base\nContract: USDC\nStatus: ok\nEndpoint: rpc.example\nTime: 10 ms",
    );
  });

  it("gives the selector as the Function when the name is not decoded", () => {
    expect(
      formatHiddenWithDetails(
        row("1", {
          contractLabel: "0x1234…5678",
          functionSelector: "0x12345678",
        }),
      ),
    ).toBe(
      "Contract: 0x1234…5678\nFunction: 0x12345678\nStatus: ok\nEndpoint: rpc.example\nTime: 10 ms",
    );
  });

  it("leaves out the Contract and Function a row has none of", () => {
    expect(formatHiddenWithDetails(row("1", { method: "eth_chainId" }))).toBe(
      "Status: ok\nEndpoint: rpc.example\nTime: 10 ms",
    );
  });
});
