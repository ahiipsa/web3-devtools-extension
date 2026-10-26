import { describe, expect, it } from "vitest";
import { loadColumnSizing, saveColumnSizing } from "./columnSizingStorage.ts";

const memoryStorage = (): Pick<Storage, "getItem" | "setItem"> => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
};

describe("column sizing storage", () => {
  it("restores the widths it saved", () => {
    const storage = memoryStorage();

    saveColumnSizing(storage, { method: 220, time: 90 });

    expect(loadColumnSizing(storage)).toEqual({ method: 220, time: 90 });
  });

  it("starts with default widths when nothing was saved", () => {
    expect(loadColumnSizing(memoryStorage())).toEqual({});
  });

  it("ignores saved data it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem("rpcRequestTable.columnSizing", "{not json");
    expect(loadColumnSizing(storage)).toEqual({});

    storage.setItem(
      "rpcRequestTable.columnSizing",
      JSON.stringify({ method: "wide", time: 90, status: -5 }),
    );
    expect(loadColumnSizing(storage)).toEqual({ time: 90 });
  });
});
