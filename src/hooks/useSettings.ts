import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  getSettings,
  parseSettings,
  saveSettings,
  Settings,
  SETTINGS_KEY,
} from "../dal/settings.ts";

const hasStorage = () =>
  typeof chrome !== "undefined" && !!chrome.storage?.local;

// The Panel's settings, kept in step with chrome.storage.local
export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // Nothing is fetched automatically before the stored value is known
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!hasStorage()) {
      return;
    }
    // Unreadable storage leaves the defaults
    getSettings()
      .then(setSettings, () => {})
      .finally(() => setLoaded(true));
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[SETTINGS_KEY]) {
        setSettings(parseSettings(changes[SETTINGS_KEY].newValue));
      }
    };
    chrome.storage.local.onChanged.addListener(handler);
    return () => chrome.storage.local.onChanged.removeListener(handler);
  }, []);

  const updateSettings = useCallback(
    (changes: Partial<Settings>) => {
      const next = { ...settings, ...changes };
      setSettings(next);
      if (hasStorage()) {
        void saveSettings(next);
      }
    },
    [settings],
  );

  return { settings, loaded, updateSettings };
};
