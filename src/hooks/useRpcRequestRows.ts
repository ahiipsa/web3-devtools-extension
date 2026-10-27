import { useContext, useMemo, useSyncExternalStore } from "react";
import { RpcRequest } from "../types/main.ts";
import { FindContract } from "../dal/contract.ts";
import { RpcRequestChain } from "../chains/endpointChains.ts";
import { buildRpcRequestRow, RpcRequestRow } from "../table/rpcRequestRow.ts";
import { AppContext } from "../components/AppContext.tsx";
import { useFindContract } from "./useFindContract.ts";

// Rows are rebuilt only for new RPC Requests, after the Contract store
// changes or once an RPC Request's Chain is learnt
const rowCache = new WeakMap<
  RpcRequest,
  { findContract: FindContract; chain: RpcRequestChain; row: RpcRequestRow }
>();

export const useRpcRequestRows = (rpcRequestList: RpcRequest[]) => {
  const findContract = useFindContract();
  const { endpointChains } = useContext(AppContext);
  const chainsVersion = useSyncExternalStore(
    endpointChains.subscribe,
    endpointChains.getVersion,
  );

  return useMemo(
    () =>
      rpcRequestList.map((request) => {
        const chain = endpointChains.getRequestChain(request);
        const cached = rowCache.get(request);
        if (cached?.findContract === findContract && cached.chain === chain) {
          return cached.row;
        }
        const row = buildRpcRequestRow(request, findContract, chain);
        rowCache.set(request, { findContract, chain, row });
        return row;
      }),
    // chainsVersion: the Chains are read from the store, not from React state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rpcRequestList, findContract, endpointChains, chainsVersion],
  );
};
