import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FindContract,
  getContracts,
  normalizeAddress,
} from "../dal/contract.ts";
import { buildErrorIndex, ErrorIndex } from "../decoding/decodeRevert.ts";

const CONTRACTS_QUERY_KEY = ["contracts"];

// One read of the whole Contract store, kept fresh as it changes
const useContracts = () => {
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

  return contracts;
};

// A lookup shared by everything that looks up many addresses at once, and
// the stored Contracts' custom errors by Selector, rebuilt only when the
// Contract store changes
export const useKnownContracts = (): {
  findContract: FindContract;
  errorIndex: ErrorIndex;
} => {
  const contracts = useContracts();
  const findContract = useCallback<FindContract>(
    (address) => contracts?.[normalizeAddress(address)],
    [contracts],
  );
  const errorIndex = useMemo(
    () => buildErrorIndex(Object.values(contracts ?? {})),
    [contracts],
  );
  return { findContract, errorIndex };
};

export const useFindContract = (): FindContract =>
  useKnownContracts().findContract;
