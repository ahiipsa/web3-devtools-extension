import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getContract, normalizeAddress } from "../dal/contract.ts";

export const useContractQuery = (params: {
  contractAddress?: `0x${string}`;
}) => {
  const { contractAddress } = params;

  const query = useQuery({
    queryKey: [
      "contract",
      contractAddress && normalizeAddress(contractAddress),
    ],
    queryFn: async () => {
      if (contractAddress) {
        return getContract(contractAddress);
      }
      return null;
    },
    enabled: !!contractAddress,
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
