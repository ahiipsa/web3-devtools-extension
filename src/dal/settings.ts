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
