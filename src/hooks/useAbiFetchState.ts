import { useContext, useSyncExternalStore } from "react";
import { AppContext } from "../components/AppContext.tsx";

// The fetch state of an address called on an Endpoint, and a manual retry
export const useAbiFetchState = (endpoint: string, address: `0x${string}`) => {
  const { abiFetcher } = useContext(AppContext);
  useSyncExternalStore(abiFetcher.subscribe, abiFetcher.getVersion);

  return {
    state: abiFetcher.getState(endpoint, address),
    fetchAbi: () => abiFetcher.fetchManually(endpoint, address),
  };
};
