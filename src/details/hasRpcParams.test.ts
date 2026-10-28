import { describe, expect, it } from "vitest";
import { hasRpcParams } from "./hasRpcParams.ts";

describe("hasRpcParams", () => {
  it("is false when params is missing", () => {
    expect(hasRpcParams(undefined)).toBe(false);
  });

  it("is false for an empty array", () => {
    expect(hasRpcParams([])).toBe(false);
  });

  it("is true for an array with a value", () => {
    expect(hasRpcParams(["0x1", "latest"])).toBe(true);
  });

  it("is true for by-name params, even empty ones", () => {
    expect(hasRpcParams({})).toBe(true);
  });

  it("is true for null, which a node would reject", () => {
    expect(hasRpcParams(null)).toBe(true);
  });
});
