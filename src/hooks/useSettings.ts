import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSettingsWriteTracker,
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
  // The latest value, so quick successive changes (typing the key) build on
  // each other rather than on a stale render
  const latest = useRef(settings);
  const [tracker] = useState(createSettingsWriteTracker);

  const apply = useCallback((next: Settings) => {
    latest.current = next;
    setSettings(next);
  }, []);

  useEffect(() => {
    if (!hasStorage()) {
      return;
    }
    // Unreadable storage leaves the defaults
    getSettings()
      .then(apply, () => {})
      .finally(() => setLoaded(true));
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (!changes[SETTINGS_KEY]) {
        return;
      }
      const stored = parseSettings(changes[SETTINGS_KEY].newValue);
      if (tracker.shouldApply(stored)) {
        apply(stored);
      }
    };
    chrome.storage.local.onChanged.addListener(handler);
    return () => chrome.storage.local.onChanged.removeListener(handler);
  }, [apply, tracker]);

  const updateSettings = useCallback(
    (changes: Partial<Settings>) => {
      const next = { ...latest.current, ...changes };
      apply(next);
      if (hasStorage()) {
        tracker.wrote(next);
        void saveSettings(next);
      }
    },
    [apply, tracker],
  );

  return { settings, loaded, updateSettings };
};
