import { useMemo } from "react";
import { RpcRequest } from "../types/main.ts";
import { FindContract } from "../dal/contract.ts";
import { buildRpcRequestRow, RpcRequestRow } from "../table/rpcRequestRow.ts";
import { useFindContract } from "./useFindContract.ts";

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
