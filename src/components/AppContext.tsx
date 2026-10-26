import React, { useState } from "react";
import { useRpcRequestList } from "../hooks/useRpcRequestList.ts";
import { RpcRequest } from "../types/main.ts";

interface AppContext {
  requestId: number | string | null;
  editForm: boolean;
  setRequestId: (requestId: number | string | null) => void;
  setEditForm: (editForm: boolean) => void;
  rpcRequestList: RpcRequest[];
}

export const AppContext = React.createContext<AppContext>({
  requestId: null,
  editForm: false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setRequestId: (_requestId: number | null | string) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setEditForm: (_editForm: boolean) => {},
  rpcRequestList: [],
});

export const AppContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [requestId, setRequestId] = useState<number | string | null>(null);
  const [editForm, setEditForm] = useState(false);

  const rpcRequestList = useRpcRequestList();

  return (
    <AppContext.Provider
      value={{ requestId, setRequestId, editForm, setEditForm, rpcRequestList }}
    >
      {children}
    </AppContext.Provider>
  );
};
