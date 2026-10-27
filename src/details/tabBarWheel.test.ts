import { describe, expect, it } from "vitest";
import { getTabBarScrollDelta } from "./tabBarWheel.ts";

const PIXELS = 0;
const LINES = 1;
const PAGES = 2;

describe("tab bar wheel", () => {
  it("scrolls the tab bar sideways by a vertical mouse wheel turn", () => {
    expect(
      getTabBarScrollDelta({ deltaX: 0, deltaY: 100, deltaMode: PIXELS }, 300),
    ).toBe(100);
    expect(
      getTabBarScrollDelta({ deltaX: 0, deltaY: -40, deltaMode: PIXELS }, 300),
    ).toBe(-40);
  });

  it("leaves a mostly horizontal trackpad swipe to the browser", () => {
    expect(
      getTabBarScrollDelta({ deltaX: 30, deltaY: 10, deltaMode: PIXELS }, 300),
    ).toBeNull();
  });

  it("ignores an event that does not move", () => {
    expect(
      getTabBarScrollDelta({ deltaX: 0, deltaY: 0, deltaMode: PIXELS }, 300),
    ).toBeNull();
  });

  it("turns lines and pages into pixels", () => {
    expect(
      getTabBarScrollDelta({ deltaX: 0, deltaY: 3, deltaMode: LINES }, 300),
    ).toBe(48);
    expect(
      getTabBarScrollDelta({ deltaX: 0, deltaY: 1, deltaMode: PAGES }, 300),
    ).toBe(300);
  });
});
