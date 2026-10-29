import React, { useCallback, useEffect, useState } from "react";
import { useRpcRequestList } from "../hooks/useRpcRequestList.ts";
import { RpcRequest } from "../types/main.ts";
import { DetailsTab } from "../details/detailsTabs.ts";
import { AbiFetcher, createAbiFetcher } from "../abiSources/abiFetcher.ts";
import { fetchFromSourcify } from "../abiSources/sourcify.ts";
import {
  createSerialQueue,
  ETHERSCAN_REQUEST_INTERVAL,
  fetchFromEtherscan,
} from "../abiSources/etherscan.ts";
import { fetchContractAbi } from "../abiSources/abiSources.ts";
import { readEip1967Implementation } from "../abiSources/eip1967.ts";
import { requestChainId } from "../chains/chainId.ts";
import {
  createEndpointChains,
  EndpointChains,
} from "../chains/endpointChains.ts";
import { getContract, saveFetchedContract } from "../dal/contract.ts";
import { useSettings } from "../hooks/useSettings.ts";
import { DEFAULT_SETTINGS, getSettings, Settings } from "../dal/settings.ts";

const etherscanQueue = createSerialQueue(ETHERSCAN_REQUEST_INTERVAL);

// One per Panel session, like the ABI fetcher that shares it
const endpointChains = createEndpointChains({
  requestChainId: (endpoint) => requestChainId(endpoint),
});

// One per Panel session, so attempts survive Clear and navigation
const abiFetcher = createAbiFetcher({
  chains: endpointChains,
  getContract,
  saveFetchedContract,
  fetchAbi: (chainId, address, endpoint) =>
    fetchContractAbi(
      {
        sourcify: (chainId, address) => fetchFromSourcify(chainId, address),
        etherscan: (chainId, address, apiKey) =>
          etherscanQueue(() => fetchFromEtherscan(chainId, address, apiKey)),
        getEtherscanApiKey: () =>
          getSettings().then(
            (settings) => settings.etherscanApiKey,
            () => "",
          ),
        readImplementation: (address) =>
          readEip1967Implementation(endpoint, address),
      },
      chainId,
      address,
    ),
});

export interface ContractTabTarget {
  requestId: string;
  address: `0x${string}`;
  // Add ABI on an Inner Call: its position in the Multicall, from 0
  innerCallIndex?: number;
}

interface AppContext {
  requestId: string | null;
  setRequestId: (requestId: string | null) => void;
  // Kept while another RPC Request is selected
  detailsTab: DetailsTab;
  setDetailsTab: (detailsTab: DetailsTab) => void;
  // The address the Contract tab shows, chosen on one RPC Request; any other
  // RPC Request's Contract tab shows its `to`
  contractTabTarget: ContractTabTarget | null;
  // Add ABI on an Inner Call: the Contract tab for its target
  showContractTab: (target: ContractTabTarget) => void;
  rpcRequestList: RpcRequest[];
  clearRpcRequestList: () => void;
  settings: Settings;
  updateSettings: (changes: Partial<Settings>) => void;
  // The toolbar's settings popover
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  // Counts the times the Etherscan API key field was asked to take the focus
  etherscanApiKeyFocusCount: number;
  // Opens the settings with the focus in the Etherscan API key field
  openEtherscanApiKeySettings: () => void;
  abiFetcher: AbiFetcher;
  endpointChains: EndpointChains;
}

// The extension has no dev server, so Fast Refresh never runs
// eslint-disable-next-line react-refresh/only-export-components
export const AppContext = React.createContext<AppContext>({
  requestId: null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setRequestId: (_requestId: string | null) => {},
  detailsTab: "Overview",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setDetailsTab: (_detailsTab: DetailsTab) => {},
  contractTabTarget: null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  showContractTab: (_target: ContractTabTarget) => {},
  rpcRequestList: [],
  clearRpcRequestList: () => {},
  settings: DEFAULT_SETTINGS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateSettings: (_changes: Partial<Settings>) => {},
  settingsOpen: false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setSettingsOpen: (_open: boolean) => {},
  etherscanApiKeyFocusCount: 0,
  openEtherscanApiKeySettings: () => {},
  abiFetcher,
  endpointChains,
});

export const AppContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [requestId, setOpenRequestId] = useState<string | null>(null);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("Overview");
  const [contractTabTarget, setContractTabTarget] =
    useState<ContractTabTarget | null>(null);

  // Selecting another RPC Request resets the Contract tab to its `to`;
  // closing and reopening the same one keeps the chosen address
  const setRequestId = useCallback((id: string | null) => {
    setOpenRequestId(id);
    if (id !== null) {
      setContractTabTarget((target) =>
        target?.requestId === id ? target : null,
      );
    }
  }, []);

  const showContractTab = useCallback((target: ContractTabTarget) => {
    setContractTabTarget(target);
    setDetailsTab("Contract");
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [etherscanApiKeyFocusCount, setEtherscanApiKeyFocusCount] = useState(0);
  const openEtherscanApiKeySettings = useCallback(() => {
    setSettingsOpen(true);
    setEtherscanApiKeyFocusCount((count) => count + 1);
  }, []);

  const { rpcRequestList, clearRpcRequestList } = useRpcRequestList();
  const { settings, loaded, updateSettings } = useSettings();

  // Chains first: the ABI fetcher reads the Chains they give
  useEffect(() => {
    endpointChains.observe(rpcRequestList);
    abiFetcher.observe(
      rpcRequestList,
      loaded && settings.fetchAbisAutomatically,
    );
  }, [rpcRequestList, loaded, settings.fetchAbisAutomatically]);

  // A new key fetches again what was fetched without it; the stored key is
  // the first one passed, so the defaults before it loads are not
  useEffect(() => {
    if (loaded) {
      abiFetcher.setEtherscanApiKey(settings.etherscanApiKey);
    }
  }, [loaded, settings.etherscanApiKey]);

  // Drop the selection when the list is cleared (Clear button or navigation)
  useEffect(() => {
    if (rpcRequestList.length === 0) {
      setRequestId(null);
      setContractTabTarget(null);
    }
  }, [rpcRequestList.length, setRequestId]);

  return (
    <AppContext.Provider
      value={{
        requestId,
        setRequestId,
        detailsTab,
        setDetailsTab,
        contractTabTarget,
        showContractTab,
        rpcRequestList,
        clearRpcRequestList,
        settings,
        updateSettings,
        settingsOpen,
        setSettingsOpen,
        etherscanApiKeyFocusCount,
        openEtherscanApiKeySettings,
        abiFetcher,
        endpointChains,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
