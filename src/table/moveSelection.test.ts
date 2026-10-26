import { describe, expect, it } from "vitest";
import { moveSelection } from "./moveSelection.ts";

const visible = ["a", "b", "c"];

describe("moveSelection", () => {
  it("moves to the next and previous RPC Request", () => {
    expect(moveSelection(visible, "b", "next")).toBe("c");
    expect(moveSelection(visible, "b", "previous")).toBe("a");
  });

  it("stays on the edge rather than wrapping around", () => {
    expect(moveSelection(visible, "c", "next")).toBe("c");
    expect(moveSelection(visible, "a", "previous")).toBe("a");
  });

  it("jumps to the first and last RPC Request", () => {
    expect(moveSelection(visible, "b", "first")).toBe("a");
    expect(moveSelection(visible, "b", "last")).toBe("c");
  });

  it("selects nothing in an empty list", () => {
    for (const move of ["next", "previous", "first", "last"] as const) {
      expect(moveSelection([], "a", move)).toBeNull();
      expect(moveSelection([], null, move)).toBeNull();
    }
  });

  it("starts from the edge when nothing is selected", () => {
    expect(moveSelection(visible, null, "next")).toBe("a");
    expect(moveSelection(visible, null, "previous")).toBe("c");
    expect(moveSelection(visible, null, "first")).toBe("a");
    expect(moveSelection(visible, null, "last")).toBe("c");
  });

  it("starts from the edge when the selection is no longer visible", () => {
    expect(moveSelection(visible, "filtered-out", "next")).toBe("a");
    expect(moveSelection(visible, "filtered-out", "previous")).toBe("c");
    expect(moveSelection(visible, "filtered-out", "first")).toBe("a");
    expect(moveSelection(visible, "filtered-out", "last")).toBe("c");
  });
});
