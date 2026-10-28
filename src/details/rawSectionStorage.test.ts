import { describe, expect, it } from "vitest";
import {
  isRawSectionOpen,
  loadRawSectionFolds,
  saveRawSectionFold,
} from "./rawSectionStorage.ts";

const memoryStorage = (): Pick<Storage, "getItem" | "setItem"> => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
};

describe("raw section folds", () => {
  it("folds a raw section beside a decoded view and opens one without", () => {
    const folds = loadRawSectionFolds(memoryStorage());

    expect(isRawSectionOpen(folds, "Raw params", true)).toBe(false);
    expect(isRawSectionOpen(folds, "Raw params", false)).toBe(true);
  });

  it("keeps the user's unfold for the next RPC Requests and after a reload", () => {
    const storage = memoryStorage();

    saveRawSectionFold(storage, "Raw params", true, true);
    const folds = loadRawSectionFolds(storage);

    expect(isRawSectionOpen(folds, "Raw params", true)).toBe(true);
    expect(isRawSectionOpen(folds, "Raw result", true)).toBe(false);
  });

  it("keeps a section open without a decoded view after folding it beside one", () => {
    const storage = memoryStorage();

    saveRawSectionFold(storage, "Raw error", false, false);
    saveRawSectionFold(storage, "Raw params", true, false);
    const folds = loadRawSectionFolds(storage);

    expect(isRawSectionOpen(folds, "Raw error", false)).toBe(false);
    expect(isRawSectionOpen(folds, "Raw params", false)).toBe(true);
  });

  it("still folds and unfolds when the storage refuses to save", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };

    const folds = saveRawSectionFold(storage, "Raw result", true, true);

    expect(isRawSectionOpen(folds, "Raw result", true)).toBe(true);
  });

  it("ignores saved data it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem("rpcRequestDetails.rawSections", "{not json");
    expect(loadRawSectionFolds(storage)).toEqual({});

    storage.setItem(
      "rpcRequestDetails.rawSections",
      JSON.stringify({ "Raw params": "yes", "Raw result": true }),
    );
    expect(loadRawSectionFolds(storage)).toEqual({ "Raw result": true });
  });
});
