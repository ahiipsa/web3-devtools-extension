import "./App.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, theme } from "antd";
import { useState, useEffect } from "react";
import { Main } from "./pages/Main.tsx";
import { ErrorBoundaryCustom } from "./components/ErrorBoundaryCustom.tsx";
import { AppContextProvider } from "./components/AppContext.tsx";

const queryClient = new QueryClient();

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

function App() {
  const [darkMode, setDarkMode] = useState(
    () => window.matchMedia(DARK_MODE_QUERY).matches,
  );

  useEffect(() => {
    const windowQuery = window.matchMedia(DARK_MODE_QUERY);
    const darkModeChange = (event: MediaQueryListEvent) => {
      setDarkMode(event.matches);
    };

    windowQuery.addEventListener("change", darkModeChange);
    return () => {
      windowQuery.removeEventListener("change", darkModeChange);
    };
  }, []);

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
