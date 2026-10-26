import "./App.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, theme } from "antd";
import { useState, useEffect, useCallback } from "react";
import { Main } from "./pages/Main.tsx";
import { ErrorBoundaryCustom } from "./components/ErrorBoundaryCustom.tsx";
import { AppContextProvider } from "./components/AppContext.tsx";

const queryClient = new QueryClient();

function App() {
  const [darkMode, setDarkMode] = useState(false);

  const windowQuery = window.matchMedia("(prefers-color-scheme:dark)");
  const darkModeChange = useCallback((event: MediaQueryListEvent) => {
    setDarkMode(event.matches);
  }, []);

  useEffect(() => {
    windowQuery.addEventListener("change", darkModeChange);
    return () => {
      windowQuery.removeEventListener("change", darkModeChange);
    };
  }, [windowQuery, darkModeChange]);

  useEffect(() => {
    setDarkMode(windowQuery.matches);
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
