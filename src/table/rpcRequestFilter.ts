import { METHOD_CATEGORIES, MethodCategory } from "../types/main.ts";
import { InnerCallRow, RpcRequestRow } from "./rpcRequestRow.ts";

// What the toolbar above the RPC Request table narrows the list down to
export interface RpcRequestFilter {
  // No Method Category selected means All
  methodCategories: MethodCategory[];
  // Only RPC Requests whose status is anything but ok
  errorsOnly: boolean;
  search: string;
}

export const emptyRpcRequestFilter = (): RpcRequestFilter => ({
  methodCategories: [],
  errorsOnly: false,
  search: "",
});

// What a search compares, ignoring case and surrounding spaces; empty
// matches everything
const normalizeSearch = (search: string) => search.trim().toLowerCase();

const includesNeedle = (texts: (string | undefined)[], needle: string) =>
  texts.some((text) => text?.toLowerCase().includes(needle));

const innerCallMatches = (innerCall: InnerCallRow, needle: string) =>
  includesNeedle(
    [
      innerCall.contractAddress,
      innerCall.contractName,
      innerCall.functionName,
      innerCall.functionSelector,
    ],
    needle,
  );

const matchesSearch = (row: RpcRequestRow, search: string) => {
  const needle = normalizeSearch(search);
  if (!needle) {
    return true;
  }
  return (
    includesNeedle(
      [
        row.method,
        row.chainName,
        row.chainId?.toString(),
        row.request.url,
        row.contractAddress,
        row.contractName,
        row.functionName,
        row.functionSelector,
      ],
      needle,
    ) ||
    !!row.innerCalls?.some((innerCall) => innerCallMatches(innerCall, needle))
  );
};

export function matchesRpcRequestFilter(
  row: RpcRequestRow,
  filter: RpcRequestFilter,
) {
  return (
    (filter.methodCategories.length === 0 ||
      filter.methodCategories.includes(row.request.methodCategory)) &&
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
  return METHOD_CATEGORIES.filter((category) => next.includes(category));
}
