import { useEffect } from "react";
import { getABI } from "../dal/abi.ts";
import { useQuery } from "@tanstack/react-query";

export const useABIQuery = (params: { abiId?: string }) => {
  const { abiId } = params;

  const query = useQuery({
    queryKey: ["abi", abiId],
    queryFn: async () => {
      if (abiId) {
        return getABI(abiId);
      }
      return null;
    },
    enabled: !!abiId,
  });

  useEffect(() => {
    const handler = (changes: {
      [p: string]: chrome.storage.StorageChange;
    }) => {
      if (changes?.abi) {
        query.refetch();
      }
    };
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }

    chrome.storage.local.onChanged.addListener(handler);

    return () => {
      chrome.storage.local.onChanged.removeListener(handler);
    };
  }, [abiId, query]);

  return query;
};
