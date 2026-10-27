import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FindContract,
  getContracts,
  normalizeAddress,
} from "../dal/contract.ts";

const CONTRACTS_QUERY_KEY = ["contracts"];

// One read of the whole Contract store, shared by everything that looks up
// many addresses at once
export const useFindContract = (): FindContract => {
  const queryClient = useQueryClient();
  const { data: contracts } = useQuery({
    queryKey: CONTRACTS_QUERY_KEY,
    queryFn: getContracts,
    enabled: typeof chrome !== "undefined" && !!chrome.storage?.local,
  });

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      return;
    }
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.contracts) {
        queryClient.invalidateQueries({ queryKey: CONTRACTS_QUERY_KEY });
      }
    };
    chrome.storage.local.onChanged.addListener(handler);
    return () => chrome.storage.local.onChanged.removeListener(handler);
  }, [queryClient]);

  return useCallback(
    (address) => contracts?.[normalizeAddress(address)],
    [contracts],
  );
};
