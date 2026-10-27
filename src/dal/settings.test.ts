import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings, saveSettings } from "./settings.ts";

describe("Panel settings", () => {
  beforeEach(() => {
    let store: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: async (keys: Record<string, unknown>) =>
            Object.fromEntries(
              Object.entries(keys).map(([key, fallback]) => [
                key,
                key in store ? store[key] : fallback,
              ]),
            ),
          set: async (items: Record<string, unknown>) => {
            store = { ...store, ...structuredClone(items) };
          },
        },
      },
    });
  });

  it("fetches ABIs automatically by default", async () => {
    expect(await getSettings()).toEqual({ fetchAbisAutomatically: true });
  });

  it("remembers that automatic fetching is turned off", async () => {
    await saveSettings({ fetchAbisAutomatically: false });

    expect(await getSettings()).toEqual({ fetchAbisAutomatically: false });
  });

  it("falls back to the default for a malformed stored value", async () => {
    await chrome.storage.local.set({
      settings: { fetchAbisAutomatically: "no" },
    });

    expect(await getSettings()).toEqual({ fetchAbisAutomatically: true });
  });
});
