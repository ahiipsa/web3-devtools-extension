import cx from "classnames";
import { RpcRequest } from "../types/main.ts";
import { RequestTableRow } from "./RequestTableRow.tsx";
import { AppContext } from "./AppContext.tsx";
import { useContext } from "react";

export const RequestTable = () => {
  const appContext = useContext(AppContext);

  const handleRowClick = (request: RpcRequest) => {
    appContext.setRequestId(request.id);
  };

  return (
    <table className="min-w-full border-collapse">
      <thead className="bg-gray-200 dark:bg-neutral-900 sticky top-0">
        <tr className="text-xs sticky top-0 h-7">
          <th className="px-4 text-left text-xs sticky top-0">RPC</th>
          <th className={cx("px-4 text-left text-xs sticky top-0")}>
            Contract
          </th>
        </tr>
      </thead>
      <tbody className="">
        {appContext.rpcRequestList.map((request) => (
          <RequestTableRow
            key={request.id}
            request={request}
            onClick={handleRowClick}
          />
        ))}
      </tbody>
    </table>
  );
};
