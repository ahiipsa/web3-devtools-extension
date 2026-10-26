import { describe, expect, it } from "vitest";
import {
  clampTableWidth,
  loadTableWidth,
  saveTableWidth,
} from "./detailsSplitStorage.ts";

const memoryStorage = (): Pick<Storage, "getItem" | "setItem"> => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
};

describe("details split storage", () => {
  it("restores the table width it saved", () => {
    const storage = memoryStorage();

    saveTableWidth(storage, 320);

    expect(loadTableWidth(storage)).toBe(320);
  });

  it("has no width when nothing was saved", () => {
    expect(loadTableWidth(memoryStorage())).toBeNull();
  });

  it("ignores saved data it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem("rpcRequestDetails.tableWidth", "wide");
    expect(loadTableWidth(storage)).toBeNull();

    storage.setItem("rpcRequestDetails.tableWidth", "-5");
    expect(loadTableWidth(storage)).toBeNull();
  });
});

describe("clampTableWidth", () => {
  it("keeps a width that leaves room for both sides", () => {
    expect(clampTableWidth(300, 1000)).toBe(300);
  });

  it("keeps the Method column readable", () => {
    expect(clampTableWidth(20, 1000)).toBe(120);
  });

  it("leaves room for the details", () => {
    expect(clampTableWidth(900, 1000)).toBe(760);
  });

  it("prefers the table's minimum in a very narrow Panel", () => {
    expect(clampTableWidth(300, 200)).toBe(120);
  });
});
