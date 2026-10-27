import { describe, expect, it } from "vitest";
import {
  buildRpcRequestLines,
  emptyExpansion,
  Expansion,
  getLineKeyAction,
  getSelectedLineId,
  LineKey,
  RpcRequestLine,
  setExpanded,
} from "./rpcRequestLines.ts";
import { InnerCallRow, RpcRequestRow } from "./rpcRequestRow.ts";
import { RpcRequest } from "../types/main.ts";

const innerCall = (
  index: number,
  fields: Partial<InnerCallRow> = {},
): InnerCallRow => ({
  index,
  contractLabel: "0x1111...1111",
  contractAddress: "0x1111111111111111111111111111111111111111",
  functionSelector: "0x70a08231",
  failed: false,
  ...fields,
});

const row = (
  id: string,
  fields: Partial<Omit<RpcRequestRow, "request">> = {},
): RpcRequestRow => ({
  request: { id } as RpcRequest,
  method: "eth_call",
  status: "ok",
  failed: false,
  endpoint: "rpc.example",
  time: 10,
  ...fields,
});

const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

// A Multicall: balanceOf on WETH9, then a failed call to an unknown target
const multicall = (id: string) =>
  row(id, {
    contractLabel: "Multicall3",
    functionName: "aggregate3",
    innerCalls: [
      innerCall(0, {
        contractLabel: "WETH9",
        contractAddress: WETH,
        contractName: "WETH9",
        functionName: "balanceOf",
      }),
      innerCall(1, {
        contractLabel: "0x2222...2222",
        contractAddress: "0x2222222222222222222222222222222222222222",
        functionSelector: "0x12345678",
        failed: true,
      }),
    ],
  });

const ids = (lines: RpcRequestLine[]) => lines.map((line) => line.id);

const rows = [row("1"), multicall("2"), row("3")];

const expand = (expansion: Expansion, target: RpcRequestRow, search = "") =>
  setExpanded(expansion, target, search, true);

const collapse = (expansion: Expansion, target: RpcRequestRow, search = "") =>
  setExpanded(expansion, target, search, false);

describe("buildRpcRequestLines", () => {
  it("shows every Multicall collapsed by default", () => {
    const lines = buildRpcRequestLines(rows, emptyExpansion(), "");

    expect(ids(lines)).toEqual(["1", "2", "3"]);
    expect(lines[1]).toMatchObject({ expandable: true, expanded: false });
    expect(lines[0]).toMatchObject({ expandable: false, expanded: false });
  });

  it("lists an expanded Multicall's Inner Calls right below it", () => {
    const lines = buildRpcRequestLines(
      rows,
      expand(emptyExpansion(), rows[1]),
      "",
    );

    expect(ids(lines)).toEqual(["1", "2", "2-0", "2-1", "3"]);
    expect(lines[1]).toMatchObject({ expanded: true });
    expect(lines[3]).toMatchObject({
      kind: "innerCall",
      row: rows[1],
      innerCall: { index: 1, failed: true },
    });
  });

  it("expands each Multicall on its own", () => {
    const other = multicall("4");
    const lines = buildRpcRequestLines(
      [...rows, other],
      expand(emptyExpansion(), other),
      "",
    );

    expect(ids(lines)).toEqual(["1", "2", "3", "4", "4-0", "4-1"]);
  });

  it("collapses an expanded Multicall again", () => {
    const expansion = collapse(expand(emptyExpansion(), rows[1]), rows[1]);

    expect(ids(buildRpcRequestLines(rows, expansion, ""))).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("does not expand a Multicall without Inner Calls", () => {
    const empty = row("5", { innerCalls: [] });
    const lines = buildRpcRequestLines(
      [empty],
      expand(emptyExpansion(), empty),
      "",
    );

    expect(ids(lines)).toEqual(["5"]);
    expect(lines[0]).toMatchObject({ expandable: false, expanded: false });
  });
});

describe("buildRpcRequestLines with a search", () => {
  it("shows a Multicall with matching Inner Calls expanded, with only those", () => {
    const lines = buildRpcRequestLines(rows, emptyExpansion(), "balanceOf");

    expect(ids(lines)).toEqual(["1", "2", "2-0", "3"]);
    expect(lines[1]).toMatchObject({ expanded: true });
  });

  it("matches an Inner Call's Contract name, target address and Selector, ignoring case", () => {
    expect(
      ids(buildRpcRequestLines(rows, emptyExpansion(), " weth9 ")),
    ).toContain("2-0");
    expect(
      ids(buildRpcRequestLines(rows, emptyExpansion(), "0x2222222222")),
    ).toEqual(["1", "2", "2-1", "3"]);
    expect(
      ids(buildRpcRequestLines(rows, emptyExpansion(), "0x12345678")),
    ).toContain("2-1");
  });

  it("keeps a Multicall that matches only by itself as the user left it", () => {
    expect(
      ids(buildRpcRequestLines(rows, emptyExpansion(), "aggregate3")),
    ).toEqual(["1", "2", "3"]);
    expect(
      ids(
        buildRpcRequestLines(
          rows,
          expand(emptyExpansion(), rows[1]),
          "aggregate3",
        ),
      ),
    ).toEqual(["1", "2", "2-0", "2-1", "3"]);
  });

  it("collapses a Multicall the search expanded for that search only", () => {
    const collapsed = collapse(emptyExpansion(), rows[1], "balanceOf");

    expect(ids(buildRpcRequestLines(rows, collapsed, "balanceOf"))).toEqual([
      "1",
      "2",
      "3",
    ]);
    // Another search expands it again
    expect(ids(buildRpcRequestLines(rows, collapsed, "weth"))).toEqual([
      "1",
      "2",
      "2-0",
      "3",
    ]);
    // And it expands again under the same search
    expect(
      ids(
        buildRpcRequestLines(
          rows,
          expand(collapsed, rows[1], "balanceOf"),
          "balanceOf",
        ),
      ),
    ).toEqual(["1", "2", "2-0", "3"]);
  });

  it("restores the previous expansion once the search is cleared", () => {
    const collapsedBefore = emptyExpansion();
    const duringSearch = collapse(collapsedBefore, rows[1], "balanceOf");
    expect(ids(buildRpcRequestLines(rows, duringSearch, ""))).toEqual([
      "1",
      "2",
      "3",
    ]);

    const expandedBefore = expand(emptyExpansion(), rows[1]);
    expect(
      ids(
        buildRpcRequestLines(
          rows,
          collapse(expandedBefore, rows[1], "balanceOf"),
          "",
        ),
      ),
    ).toEqual(["1", "2", "2-0", "2-1", "3"]);
  });
});

describe("getSelectedLineId", () => {
  const lines = buildRpcRequestLines(
    rows,
    expand(emptyExpansion(), rows[1]),
    "",
  );

  it("is the Inner Call's line while it is shown", () => {
    expect(getSelectedLineId(lines, "2", 1)).toBe("2-1");
  });

  it("falls back to the Multicall's line while the Inner Call is hidden", () => {
    const collapsedLines = buildRpcRequestLines(rows, emptyExpansion(), "");
    expect(getSelectedLineId(collapsedLines, "2", 1)).toBe("2");
  });

  it("is the Selected RPC Request's line without an Inner Call, and none without a selection", () => {
    expect(getSelectedLineId(lines, "3", null)).toBe("3");
    expect(getSelectedLineId(lines, null, null)).toBeNull();
  });
});

describe("getLineKeyAction", () => {
  const collapsedLines = buildRpcRequestLines(rows, emptyExpansion(), "");
  const expandedLines = buildRpcRequestLines(
    rows,
    expand(emptyExpansion(), rows[1]),
    "",
  );

  const selects = (
    lines: RpcRequestLine[],
    selected: string | null,
    key: LineKey,
  ) => {
    const action = getLineKeyAction(lines, selected, key);
    return action?.kind === "select" ? action.line.id : action;
  };

  it("walks the shown Inner Call lines with ↑ and ↓", () => {
    expect(selects(expandedLines, "2", "ArrowDown")).toBe("2-0");
    expect(selects(expandedLines, "2-0", "ArrowDown")).toBe("2-1");
    expect(selects(expandedLines, "2-1", "ArrowDown")).toBe("3");
    expect(selects(expandedLines, "3", "ArrowUp")).toBe("2-1");
    expect(selects(collapsedLines, "2", "ArrowDown")).toBe("3");
  });

  it("goes to the first and last line with Home and End", () => {
    const lastExpanded = buildRpcRequestLines(
      [row("1"), multicall("2")],
      expand(emptyExpansion(), rows[1]),
      "",
    );
    expect(selects(lastExpanded, "2-0", "Home")).toBe("1");
    expect(selects(lastExpanded, "1", "End")).toBe("2-1");
  });

  it("expands a collapsed Multicall with →, then steps into its first Inner Call", () => {
    expect(getLineKeyAction(collapsedLines, "2", "ArrowRight")).toEqual({
      kind: "expand",
      row: rows[1],
    });
    expect(selects(expandedLines, "2", "ArrowRight")).toBe("2-0");
  });

  it("collapses an expanded Multicall with ←", () => {
    expect(getLineKeyAction(expandedLines, "2", "ArrowLeft")).toEqual({
      kind: "collapse",
      row: rows[1],
    });
    expect(getLineKeyAction(collapsedLines, "2", "ArrowLeft")).toBeUndefined();
  });

  it("goes from an Inner Call back to its Multicall with ←, and ignores →", () => {
    expect(selects(expandedLines, "2-1", "ArrowLeft")).toBe("2");
    expect(
      getLineKeyAction(expandedLines, "2-1", "ArrowRight"),
    ).toBeUndefined();
  });

  it("ignores ← and → on an RPC Request that is no Multicall, or without a selection", () => {
    expect(getLineKeyAction(expandedLines, "1", "ArrowRight")).toBeUndefined();
    expect(getLineKeyAction(expandedLines, "1", "ArrowLeft")).toBeUndefined();
    expect(getLineKeyAction(expandedLines, null, "ArrowRight")).toBeUndefined();
  });
});
