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

  it("fetches ABIs automatically and has no Etherscan API key by default", async () => {
    expect(await getSettings()).toEqual({
      fetchAbisAutomatically: true,
      etherscanApiKey: "",
    });
  });

  it("remembers that automatic fetching is turned off", async () => {
    await saveSettings({ fetchAbisAutomatically: false, etherscanApiKey: "" });

    expect(await getSettings()).toMatchObject({
      fetchAbisAutomatically: false,
    });
  });

  it("remembers the Etherscan API key", async () => {
    await saveSettings({ fetchAbisAutomatically: true, etherscanApiKey: "K" });

    expect(await getSettings()).toMatchObject({ etherscanApiKey: "K" });
  });

  it("keeps the setting stored before there was an Etherscan API key", async () => {
    await chrome.storage.local.set({
      settings: { fetchAbisAutomatically: false },
    });

    expect(await getSettings()).toEqual({
      fetchAbisAutomatically: false,
      etherscanApiKey: "",
    });
  });

  it("falls back to the defaults for malformed stored values", async () => {
    await chrome.storage.local.set({
      settings: { fetchAbisAutomatically: "no", etherscanApiKey: 42 },
    });

    expect(await getSettings()).toEqual({
      fetchAbisAutomatically: true,
      etherscanApiKey: "",
    });
  });
});
