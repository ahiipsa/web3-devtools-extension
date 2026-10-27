import { describe, expect, it } from "vitest";
import { getTabListScrollDelta } from "./tabListWheel.ts";

const PIXELS = 0;
const LINES = 1;
const PAGES = 2;

describe("tab list wheel", () => {
  it("scrolls the tab list sideways by a vertical mouse wheel turn", () => {
    expect(
      getTabListScrollDelta({ deltaX: 0, deltaY: 100, deltaMode: PIXELS }, 300),
    ).toBe(100);
    expect(
      getTabListScrollDelta({ deltaX: 0, deltaY: -40, deltaMode: PIXELS }, 300),
    ).toBe(-40);
  });

  it("leaves a mostly horizontal trackpad swipe to the browser", () => {
    expect(
      getTabListScrollDelta({ deltaX: 30, deltaY: 10, deltaMode: PIXELS }, 300),
    ).toBeNull();
  });

  it("ignores an event that does not move", () => {
    expect(
      getTabListScrollDelta({ deltaX: 0, deltaY: 0, deltaMode: PIXELS }, 300),
    ).toBeNull();
  });

  it("turns lines and pages into pixels", () => {
    expect(
      getTabListScrollDelta({ deltaX: 0, deltaY: 3, deltaMode: LINES }, 300),
    ).toBe(48);
    expect(
      getTabListScrollDelta({ deltaX: 0, deltaY: 1, deltaMode: PAGES }, 300),
    ).toBe(300);
  });
});
