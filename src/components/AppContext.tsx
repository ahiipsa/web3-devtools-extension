import React, { useEffect, useState } from "react";
import { useRpcRequestList } from "../hooks/useRpcRequestList.ts";
import { RpcRequest } from "../types/main.ts";
import { DetailsTab } from "../details/detailsTabs.ts";
import { AbiFetcher, createAbiFetcher } from "../abiSources/abiFetcher.ts";
import { fetchFromSourcify } from "../abiSources/sourcify.ts";
import { requestChainId } from "../abiSources/chainId.ts";
import { getContract, saveFetchedContract } from "../dal/contract.ts";
import { useSettings } from "../hooks/useSettings.ts";
import { Settings } from "../dal/settings.ts";

// One per Panel session, so attempts survive Clear and navigation
const abiFetcher = createAbiFetcher({
  getContract,
  saveFetchedContract,
  fetchAbi: (chainId, address) => fetchFromSourcify(chainId, address),
  requestChainId: (endpoint) => requestChainId(endpoint),
});

interface AppContext {
  requestId: string | null;
  setRequestId: (requestId: string | null) => void;
  // Kept while another RPC Request is selected
  detailsTab: DetailsTab;
  setDetailsTab: (detailsTab: DetailsTab) => void;
  rpcRequestList: RpcRequest[];
  clearRpcRequestList: () => void;
  settings: Settings;
  updateSettings: (changes: Partial<Settings>) => void;
  abiFetcher: AbiFetcher;
}

export const AppContext = React.createContext<AppContext>({
  requestId: null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setRequestId: (_requestId: string | null) => {},
  detailsTab: "Overview",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setDetailsTab: (_detailsTab: DetailsTab) => {},
  rpcRequestList: [],
  clearRpcRequestList: () => {},
  settings: { fetchAbisAutomatically: true },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateSettings: (_changes: Partial<Settings>) => {},
  abiFetcher,
});

export const AppContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [requestId, setRequestId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("Overview");

  const { rpcRequestList, clearRpcRequestList } = useRpcRequestList();
  const { settings, loaded, updateSettings } = useSettings();

  useEffect(() => {
    abiFetcher.observe(
      rpcRequestList,
      loaded && settings.fetchAbisAutomatically,
    );
  }, [rpcRequestList, loaded, settings.fetchAbisAutomatically]);

  // Drop the selection when the list is cleared (Clear button or navigation)
  useEffect(() => {
    if (rpcRequestList.length === 0) {
      setRequestId(null);
    }
  }, [rpcRequestList.length]);

  return (
    <AppContext.Provider
      value={{
        requestId,
        setRequestId,
        detailsTab,
        setDetailsTab,
        rpcRequestList,
        clearRpcRequestList,
        settings,
        updateSettings,
        abiFetcher,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
