import { getMatchingInnerCalls, normalizeSearch } from "./rpcRequestFilter.ts";
import { InnerCallRow, RpcRequestRow } from "./rpcRequestRow.ts";
import { moveSelection, SelectionMove } from "./moveSelection.ts";

// One line of the RPC Request table: an RPC Request, or one Inner Call of an
// expanded Multicall right below it
export type RpcRequestLine =
  | {
      kind: "rpcRequest";
      id: string;
      row: RpcRequestRow;
      // A Multicall with Inner Calls, which a chevron expands
      expandable: boolean;
      expanded: boolean;
    }
  | {
      kind: "innerCall";
      id: string;
      // The Multicall's row
      row: RpcRequestRow;
      innerCall: InnerCallRow;
    };

// Which Multicalls show their Inner Calls. Each expands on its own, collapsed
// by default. A search shows a Multicall with matching Inner Calls expanded,
// with only those; collapsing one then holds for that search alone, so
// clearing it restores the expansion from before.
export interface Expansion {
  expanded: ReadonlySet<string>;
  collapsedInSearch: { search: string; ids: ReadonlySet<string> };
}

export const emptyExpansion = (): Expansion => ({
  expanded: new Set(),
  collapsedInSearch: { search: "", ids: new Set() },
});

export const getInnerCallLineId = (requestId: string, index: number) =>
  `${requestId}-${index}`;

const getCollapsedInSearch = (expansion: Expansion, search: string) =>
  expansion.collapsedInSearch.search === normalizeSearch(search)
    ? expansion.collapsedInSearch.ids
    : new Set<string>();

// The Inner Calls a Multicall shows below it; undefined while collapsed
const getShownInnerCalls = (
  row: RpcRequestRow,
  expansion: Expansion,
  search: string,
): InnerCallRow[] | undefined => {
  if (!row.innerCalls?.length) {
    return undefined;
  }
  const id = row.request.id;
  const matching = getMatchingInnerCalls(row, search);
  if (matching?.length) {
    return getCollapsedInSearch(expansion, search).has(id)
      ? undefined
      : matching;
  }
  return expansion.expanded.has(id) ? row.innerCalls : undefined;
};

// The table's lines for the filtered and sorted rows, in their order
export function buildRpcRequestLines(
  rows: readonly RpcRequestRow[],
  expansion: Expansion,
  search: string,
): RpcRequestLine[] {
  return rows.flatMap((row) => {
    const shown = getShownInnerCalls(row, expansion, search);
    const requestLine: RpcRequestLine = {
      kind: "rpcRequest",
      id: row.request.id,
      row,
      expandable: !!row.innerCalls?.length,
      expanded: shown !== undefined,
    };
    return [
      requestLine,
      ...(shown ?? []).map(
        (innerCall): RpcRequestLine => ({
          kind: "innerCall",
          id: getInnerCallLineId(row.request.id, innerCall.index),
          row,
          innerCall,
        }),
      ),
    ];
  });
}

// Expands or collapses one Multicall under the current search
export function setExpanded(
  expansion: Expansion,
  row: RpcRequestRow,
  search: string,
  expanded: boolean,
): Expansion {
  const id = row.request.id;
  const toggle = (ids: ReadonlySet<string>, add: boolean) => {
    const next = new Set(ids);
    if (add) {
      next.add(id);
    } else {
      next.delete(id);
    }
    return next;
  };

  if (getMatchingInnerCalls(row, search)?.length) {
    return {
      ...expansion,
      collapsedInSearch: {
        search: normalizeSearch(search),
        ids: toggle(getCollapsedInSearch(expansion, search), !expanded),
      },
    };
  }
  return { ...expansion, expanded: toggle(expansion.expanded, expanded) };
}

// The highlighted line: the Inner Call's, while it is shown, else the
// Selected RPC Request's
export function getSelectedLineId(
  lines: readonly RpcRequestLine[],
  requestId: string | null,
  innerCallIndex: number | null,
): string | null {
  if (requestId === null) {
    return null;
  }
  if (innerCallIndex !== null) {
    const innerCallLineId = getInnerCallLineId(requestId, innerCallIndex);
    if (lines.some((line) => line.id === innerCallLineId)) {
      return innerCallLineId;
    }
  }
  return requestId;
}

export type LineKey =
  | "ArrowDown"
  | "ArrowUp"
  | "Home"
  | "End"
  | "ArrowLeft"
  | "ArrowRight";

export type LineKeyAction =
  | { kind: "select"; line: RpcRequestLine }
  | { kind: "expand" | "collapse"; row: RpcRequestRow };

const VERTICAL_MOVES: Partial<Record<LineKey, SelectionMove>> = {
  ArrowDown: "next",
  ArrowUp: "previous",
  Home: "first",
  End: "last",
};

// What a key does on the table, like the Elements tree: ↑/↓ walk every shown
// line, → expands a Multicall and then steps into its first Inner Call, ←
// collapses it, and ← on an Inner Call goes back to its Multicall
export function getLineKeyAction(
  lines: readonly RpcRequestLine[],
  selectedLineId: string | null,
  key: LineKey,
): LineKeyAction | undefined {
  const move = VERTICAL_MOVES[key];
  if (move) {
    const id = moveSelection(
      lines.map((line) => line.id),
      selectedLineId,
      move,
    );
    const line = lines.find((candidate) => candidate.id === id);
    return line && { kind: "select", line };
  }

  const index = lines.findIndex((line) => line.id === selectedLineId);
  const line = lines[index];
  if (!line) {
    return undefined;
  }
  if (line.kind === "innerCall") {
    const parent = lines.find(
      (candidate) => candidate.id === line.row.request.id,
    );
    return key === "ArrowLeft" && parent
      ? { kind: "select", line: parent }
      : undefined;
  }
  if (!line.expandable) {
    return undefined;
  }
  if (key === "ArrowLeft") {
    return line.expanded ? { kind: "collapse", row: line.row } : undefined;
  }
  if (!line.expanded) {
    return { kind: "expand", row: line.row };
  }
  const firstInnerCall = lines[index + 1];
  return firstInnerCall?.kind === "innerCall"
    ? { kind: "select", line: firstInnerCall }
    : undefined;
}
