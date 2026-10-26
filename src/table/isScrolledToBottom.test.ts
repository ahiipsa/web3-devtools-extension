import { describe, expect, it } from "vitest";
import { isScrolledToBottom } from "./isScrolledToBottom.ts";

describe("isScrolledToBottom", () => {
  it("is true at the bottom, within a pixel of rounding", () => {
    expect(
      isScrolledToBottom({
        scrollTop: 800,
        clientHeight: 200,
        scrollHeight: 1000,
      }),
    ).toBe(true);
    expect(
      isScrolledToBottom({
        scrollTop: 799.5,
        clientHeight: 200,
        scrollHeight: 1000,
      }),
    ).toBe(true);
  });

  it("is false once scrolled up by a row", () => {
    expect(
      isScrolledToBottom({
        scrollTop: 779,
        clientHeight: 200,
        scrollHeight: 1000,
      }),
    ).toBe(false);
  });

  it("is true while the list fits without scrolling", () => {
    expect(
      isScrolledToBottom({
        scrollTop: 0,
        clientHeight: 500,
        scrollHeight: 300,
      }),
    ).toBe(true);
  });
});
