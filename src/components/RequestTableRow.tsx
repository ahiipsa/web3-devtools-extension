import cx from "classnames";
import { trimContractAddress } from "../utils/text.ts";
import { RpcRequest } from "../types/main.ts";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { getContractAddress, isContractCall } from "../utils/requestUtils.ts";

interface RequestTableRowProps {
  request: RpcRequest;
  onClick: (request: RpcRequest) => void;
}

export const RequestTableRow = (props: RequestTableRowProps) => {
  const { request, onClick } = props;

  const contractAddress = getContractAddress(request);

  const contractQuery = useContractQuery({
    contractAddress: contractAddress || undefined,
  });

  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer text-xs"
      onClick={() => onClick(request)}
    >
      <td className="border-t px-4 py-2 truncate max-w-40">
        <div className="flex flex-col">
          <div className="font-medium">{request?.requestBody.method}</div>
          <div className="truncate">{request?.url}</div>
        </div>
      </td>
      <td className={cx("border-t px-4 py-2")}>
        {isContractCall(request) && (
          <>
            <div>{contractAddress && trimContractAddress(contractAddress)}</div>
            {contractQuery.data && <div>{contractQuery.data?.name}</div>}
          </>
        )}
      </td>
    </tr>
  );
};
