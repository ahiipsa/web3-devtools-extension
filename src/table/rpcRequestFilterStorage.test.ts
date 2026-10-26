import { describe, expect, it } from "vitest";
import {
  loadRpcRequestFilter,
  saveRpcRequestFilter,
} from "./rpcRequestFilterStorage.ts";

const memoryStorage = (): Pick<Storage, "getItem" | "setItem"> => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
};

describe("RPC Request filter storage", () => {
  it("restores the filter it saved", () => {
    const storage = memoryStorage();
    const filter = {
      methodCategories: ["Calls" as const, "Logs" as const],
      errorsOnly: true,
      search: "usdc",
    };

    saveRpcRequestFilter(storage, filter);

    expect(loadRpcRequestFilter(storage)).toEqual(filter);
  });

  it("starts unfiltered when nothing was saved", () => {
    expect(loadRpcRequestFilter(memoryStorage())).toEqual({
      methodCategories: [],
      errorsOnly: false,
      search: "",
    });
  });

  it("drops the saved parts it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem("rpcRequestTable.filter", "{not json");
    expect(loadRpcRequestFilter(storage)).toEqual({
      methodCategories: [],
      errorsOnly: false,
      search: "",
    });

    storage.setItem(
      "rpcRequestTable.filter",
      JSON.stringify({
        methodCategories: ["Calls", "Blocks", 7],
        errorsOnly: "yes",
        search: "balanceOf",
      }),
    );
    expect(loadRpcRequestFilter(storage)).toEqual({
      methodCategories: ["Calls"],
      errorsOnly: false,
      search: "balanceOf",
    });
  });
});
