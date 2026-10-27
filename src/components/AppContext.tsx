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
import { requestChainId } from "../abiSources/chainId.ts";
import { getContract, saveFetchedContract } from "../dal/contract.ts";
import { useSettings } from "../hooks/useSettings.ts";
import { DEFAULT_SETTINGS, getSettings, Settings } from "../dal/settings.ts";

const etherscanQueue = createSerialQueue(ETHERSCAN_REQUEST_INTERVAL);

// One per Panel session, so attempts survive Clear and navigation
const abiFetcher = createAbiFetcher({
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
  requestChainId: (endpoint) => requestChainId(endpoint),
});

export interface ContractTabTarget {
  requestId: string;
  address: `0x${string}`;
}

// An Inner Call picked in the table, highlighted in its Multicall's Params
export interface SelectedInnerCall {
  requestId: string;
  index: number;
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
  selectedInnerCall: SelectedInnerCall | null;
  setSelectedInnerCall: (innerCall: SelectedInnerCall | null) => void;
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
  contractTabTarget: null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  showContractTab: (_target: ContractTabTarget) => {},
  selectedInnerCall: null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setSelectedInnerCall: (_innerCall: SelectedInnerCall | null) => {},
  rpcRequestList: [],
  clearRpcRequestList: () => {},
  settings: DEFAULT_SETTINGS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  updateSettings: (_changes: Partial<Settings>) => {},
  abiFetcher,
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
  const [selectedInnerCall, setSelectedInnerCall] =
    useState<SelectedInnerCall | null>(null);

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
      setContractTabTarget(null);
      setSelectedInnerCall(null);
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
        selectedInnerCall,
        setSelectedInnerCall,
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
