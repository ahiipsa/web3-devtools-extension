import {
  ALL_METHOD_CATEGORIES,
  EMPTY_RPC_REQUEST_FILTER,
  RpcRequestFilter,
} from "./rpcRequestFilter.ts";

// Kept in the Panel's localStorage, so filters survive closing DevTools
const FILTER_KEY = "rpcRequestTable.filter";

type FilterStorage = Pick<Storage, "getItem" | "setItem">;

export function loadRpcRequestFilter(storage: FilterStorage): RpcRequestFilter {
  let saved: unknown;
  try {
    saved = JSON.parse(storage.getItem(FILTER_KEY) ?? "{}");
  } catch {
    return EMPTY_RPC_REQUEST_FILTER;
  }
  if (typeof saved !== "object" || saved === null) {
    return EMPTY_RPC_REQUEST_FILTER;
  }

  const { categories, errorsOnly, search } = saved as Record<string, unknown>;
  return {
    categories: Array.isArray(categories)
      ? ALL_METHOD_CATEGORIES.filter((category) =>
          categories.includes(category),
        )
      : [],
    errorsOnly: errorsOnly === true,
    search: typeof search === "string" ? search : "",
  };
}

export function saveRpcRequestFilter(
  storage: FilterStorage,
  filter: RpcRequestFilter,
) {
  storage.setItem(FILTER_KEY, JSON.stringify(filter));
}
