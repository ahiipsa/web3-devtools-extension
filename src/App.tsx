import "./App.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, theme } from "antd";
import { useState, useEffect } from "react";
import { Main } from "./pages/Main.tsx";
import { ErrorBoundaryCustom } from "./components/ErrorBoundaryCustom.tsx";
import { AppContextProvider } from "./components/AppContext.tsx";
import { isDarkTheme } from "./theme/isDarkTheme.ts";

const queryClient = new QueryClient();

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

// undefined outside DevTools, e.g. on the vite dev server
const devToolsThemeName =
  typeof chrome === "undefined"
    ? undefined
    : chrome.devtools?.panels?.themeName;

function App() {
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia(DARK_MODE_QUERY).matches,
  );

  // The DevTools theme wins; the system scheme only matters outside DevTools
  useEffect(() => {
    if (devToolsThemeName !== undefined) {
      return;
    }
    const windowQuery = window.matchMedia(DARK_MODE_QUERY);
    const darkModeChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    windowQuery.addEventListener("change", darkModeChange);
    return () => {
      windowQuery.removeEventListener("change", darkModeChange);
    };
  }, []);

  const darkMode = isDarkTheme(devToolsThemeName, prefersDark);

  // Tailwind's dark: variant and the table's colours key off this class
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        }}
      >
        <ErrorBoundaryCustom>
          <AppContextProvider>
            <Main />
          </AppContextProvider>
        </ErrorBoundaryCustom>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App;
