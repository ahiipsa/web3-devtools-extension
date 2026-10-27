export interface Settings {
  // Fetch the ABI of a called address without a Contract from an ABI Source
  fetchAbisAutomatically: boolean;
  // Lets Etherscan be asked after Sourcify; empty for none. Never logged or
  // shown outside the settings field
  etherscanApiKey: string;
}

export const DEFAULT_SETTINGS: Settings = {
  fetchAbisAutomatically: true,
  etherscanApiKey: "",
};

// Stored in chrome.storage.local under one key
export const SETTINGS_KEY = "settings";

export const parseSettings = (value: unknown): Settings => {
  const { fetchAbisAutomatically, etherscanApiKey } = (value ??
    {}) as Partial<Settings>;
  return {
    fetchAbisAutomatically:
      typeof fetchAbisAutomatically === "boolean"
        ? fetchAbisAutomatically
        : DEFAULT_SETTINGS.fetchAbisAutomatically,
    etherscanApiKey:
      typeof etherscanApiKey === "string"
        ? etherscanApiKey
        : DEFAULT_SETTINGS.etherscanApiKey,
  };
};

export const getSettings = async (): Promise<Settings> => {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get({
    [SETTINGS_KEY]: {},
  });
  return parseSettings(settings);
};

export const saveSettings = (settings: Settings) =>
  chrome.storage.local.set({ [SETTINGS_KEY]: settings });

// Tells the Panel's own writes, echoed back by storage.onChanged in order,
// from changes made elsewhere. While own writes are still in flight, an
// echo of an earlier one must not roll back what the user typed since.
export const createSettingsWriteTracker = () => {
  const pending: string[] = [];
  const serialize = (settings: Settings) => JSON.stringify(settings);
  return {
    wrote: (settings: Settings) => {
      pending.push(serialize(settings));
    },
    // Whether a stored value should replace the Panel's settings
    shouldApply: (stored: Settings) => {
      const index = pending.indexOf(serialize(stored));
      if (index === -1) {
        return true;
      }
      pending.splice(0, index + 1);
      return false;
    },
  };
};
