import { METHOD_CATEGORIES } from "../types/main.ts";
import { emptyRpcRequestFilter, RpcRequestFilter } from "./rpcRequestFilter.ts";

// Kept in the Panel's localStorage, so filters survive closing DevTools
const FILTER_KEY = "rpcRequestTable.filter";

type FilterStorage = Pick<Storage, "getItem" | "setItem">;

export function loadRpcRequestFilter(storage: FilterStorage): RpcRequestFilter {
  let saved: unknown;
  try {
    saved = JSON.parse(storage.getItem(FILTER_KEY) ?? "{}");
  } catch {
    return emptyRpcRequestFilter();
  }
  if (typeof saved !== "object" || saved === null) {
    return emptyRpcRequestFilter();
  }

  const { methodCategories, errorsOnly, search } = saved as Record<
    string,
    unknown
  >;
  return {
    methodCategories: Array.isArray(methodCategories)
      ? METHOD_CATEGORIES.filter((category) =>
          methodCategories.includes(category),
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
