import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getContract } from "../dal/contract.ts";

export const useContractQuery = (params: {
  contractAddress?: `0x${string}`;
}) => {
  const { contractAddress } = params;

  const query = useQuery({
    queryKey: ["contract", params.contractAddress],
    queryFn: async () => {
      if (params?.contractAddress) {
        return getContract(params?.contractAddress);
      }
      return null;
    },
    enabled: !!params.contractAddress,
  });

  useEffect(() => {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      return;
    }

    const handler = (changes: {
      [p: string]: chrome.storage.StorageChange;
    }) => {
      if (changes?.contracts) {
        query.refetch();
      }
    };

    chrome.storage.local.onChanged.addListener(handler);

    return () => {
      chrome.storage.local.onChanged.removeListener(handler);
    };
  }, [contractAddress, query]);

  return query;
};
