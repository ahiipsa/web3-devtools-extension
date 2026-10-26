// `themeName` is chrome.devtools.panels.themeName: "default" or "dark".
// It is undefined when the Panel is opened outside DevTools (vite dev server).
export function isDarkTheme(
  themeName: string | undefined,
  prefersDarkColorScheme: boolean,
) {
  return themeName === undefined
    ? prefersDarkColorScheme
    : themeName === "dark";
}
