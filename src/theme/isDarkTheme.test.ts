import { describe, expect, it } from "vitest";
import { isDarkTheme } from "./isDarkTheme.ts";

describe("isDarkTheme", () => {
  it("follows the DevTools theme over the system colour scheme", () => {
    expect(isDarkTheme("dark", false)).toBe(true);
    expect(isDarkTheme("default", true)).toBe(false);
  });

  it("falls back to the system colour scheme outside DevTools", () => {
    expect(isDarkTheme(undefined, true)).toBe(true);
    expect(isDarkTheme(undefined, false)).toBe(false);
  });
});
