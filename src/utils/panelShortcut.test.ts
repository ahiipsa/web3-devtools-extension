// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { addPanelShortcut } from "./panelShortcut.ts";

// Stands in for the listener DevTools injects into the Panel: on document, in
// the bubble phase, it prevents the default of Esc and Ctrl/⌘ shortcuts and
// forwards them to DevTools itself
const stubDevToolsForwarding = () => {
  const forwarded: string[] = [];
  const forward = (event: KeyboardEvent) => {
    event.preventDefault();
    forwarded.push(event.key);
  };
  document.addEventListener("keydown", forward);
  return {
    forwarded,
    remove: () => document.removeEventListener("keydown", forward),
  };
};

const press = (key: string, init: KeyboardEventInit = {}) =>
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );

describe("addPanelShortcut", () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  it("handles a shortcut before DevTools can forward it, and keeps DevTools from seeing it", () => {
    const devTools = stubDevToolsForwarding();
    const handle = vi.fn((event: KeyboardEvent) => event.key === "Escape");
    cleanups.push(devTools.remove, addPanelShortcut(handle));

    press("Escape");

    expect(handle).toHaveBeenCalledOnce();
    expect(devTools.forwarded).toEqual([]);
  });

  it("leaves a key the Panel does not handle to DevTools", () => {
    const devTools = stubDevToolsForwarding();
    cleanups.push(
      devTools.remove,
      addPanelShortcut(() => false),
    );

    press("f", { metaKey: true });

    expect(devTools.forwarded).toEqual(["f"]);
  });

  it("stops listening once removed", () => {
    const devTools = stubDevToolsForwarding();
    const handle = vi.fn(() => true);
    addPanelShortcut(handle)();
    cleanups.push(devTools.remove);

    press("Escape");

    expect(handle).not.toHaveBeenCalled();
    expect(devTools.forwarded).toEqual(["Escape"]);
  });
});
