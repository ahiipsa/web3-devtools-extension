import { MethodCategory } from "../types/main.ts";
import { RpcRequestRow } from "./rpcRequestRow.ts";

export const ALL_METHOD_CATEGORIES: readonly MethodCategory[] = [
  "Calls",
  "Transactions",
  "Logs",
  "Chain",
  "Other",
];

// What the toolbar above the RPC Request table narrows the list down to
export interface RpcRequestFilter {
  // No Method Category selected means All
  categories: MethodCategory[];
  // Only RPC Requests whose status is anything but ok
  errorsOnly: boolean;
  search: string;
}

export const EMPTY_RPC_REQUEST_FILTER: RpcRequestFilter = {
  categories: [],
  errorsOnly: false,
  search: "",
};

const matchesSearch = (row: RpcRequestRow, search: string) => {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [
    row.method,
    row.request.url,
    row.contractAddress,
    row.contractName,
    row.functionName,
  ].some((text) => text?.toLowerCase().includes(needle));
};

export function matchesRpcRequestFilter(
  row: RpcRequestRow,
  filter: RpcRequestFilter,
) {
  return (
    (filter.categories.length === 0 ||
      filter.categories.includes(row.request.methodCategory)) &&
    (!filter.errorsOnly || row.failed) &&
    matchesSearch(row, filter.search)
  );
}

export type MethodCategoryChip = MethodCategory | "All";

// A plain click selects one Method Category, Ctrl/⌘+click adds or removes
// one, and All (or removing the last one) goes back to every category
export function selectMethodCategory(
  selected: readonly MethodCategory[],
  chip: MethodCategoryChip,
  additive: boolean,
): MethodCategory[] {
  if (chip === "All") {
    return [];
  }
  if (!additive) {
    return [chip];
  }
  const next = selected.includes(chip)
    ? selected.filter((category) => category !== chip)
    : [...selected, chip];
  return ALL_METHOD_CATEGORIES.filter((category) => next.includes(category));
}
