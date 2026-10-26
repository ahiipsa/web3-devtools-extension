import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RpcRequest } from "../types/main.ts";
import { getContracts, normalizeAddress } from "../dal/contract.ts";
import {
  buildRpcRequestRow,
  FindContract,
  RpcRequestRow,
} from "../table/rpcRequestRow.ts";

const CONTRACTS_QUERY_KEY = ["contracts"];

// One read of the whole Contract store, shared by every row
const useFindContract = (): FindContract => {
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

// Rows are rebuilt only for new RPC Requests or after the Contract store changes
const rowCache = new WeakMap<
  RpcRequest,
  { findContract: FindContract; row: RpcRequestRow }
>();

export const useRpcRequestRows = (rpcRequestList: RpcRequest[]) => {
  const findContract = useFindContract();

  return useMemo(
    () =>
      rpcRequestList.map((request) => {
        const cached = rowCache.get(request);
        if (cached?.findContract === findContract) {
          return cached.row;
        }
        const row = buildRpcRequestRow(request, findContract);
        rowCache.set(request, { findContract, row });
        return row;
      }),
    [rpcRequestList, findContract],
  );
};
