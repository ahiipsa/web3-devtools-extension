import React, { useEffect, useState } from "react";
import { useRpcRequestList } from "../hooks/useRpcRequestList.ts";
import { RpcRequest } from "../types/main.ts";
import { DetailsTab } from "../details/detailsTabs.ts";

interface AppContext {
  requestId: number | string | null;
  setRequestId: (requestId: number | string | null) => void;
  // Kept while another RPC Request is selected
  detailsTab: DetailsTab;
  setDetailsTab: (detailsTab: DetailsTab) => void;
  rpcRequestList: RpcRequest[];
  clearRpcRequestList: () => void;
}

export const AppContext = React.createContext<AppContext>({
  requestId: null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setRequestId: (_requestId: number | null | string) => {},
  detailsTab: "Overview",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setDetailsTab: (_detailsTab: DetailsTab) => {},
  rpcRequestList: [],
  clearRpcRequestList: () => {},
});

export const AppContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [requestId, setRequestId] = useState<number | string | null>(null);
  const [detailsTab, setDetailsTab] = useState<DetailsTab>("Overview");

  const { rpcRequestList, clearRpcRequestList } = useRpcRequestList();

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
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
