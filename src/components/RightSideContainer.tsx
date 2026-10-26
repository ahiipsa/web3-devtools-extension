import cx from "classnames";
import { RequestDetails } from "./RequestDetails.tsx";
import { ContractForm } from "./ContractForm.tsx";
import { useContext } from "react";
import { AppContext } from "./AppContext.tsx";
import { getContractAddress } from "../utils/requestUtils.ts";

export const RightSideContainer = () => {
  const appContext = useContext(AppContext);

  if (!appContext.requestId) {
    return null;
  }

  const rpcRequest = appContext.rpcRequestList?.find(
    (request) => request.id === appContext.requestId,
  );

  if (!rpcRequest) {
    return null;
  }

  const contractAddress = getContractAddress(rpcRequest);

  return (
    <>
      <div
        className={cx(
          "min-h-[200px] border-r-1 overflow-y-scroll max-h-screen",
          appContext.editForm ? "col-span-2" : "col-span-3",
        )}
      >
        <RequestDetails
          request={rpcRequest}
          onClose={() => appContext.setRequestId(null)}
          onEditContract={() => {
            appContext.setEditForm(!appContext.editForm);
          }}
        />
      </div>
      {appContext.editForm && contractAddress && (
        <div className="grow">
          <div className="px-4 py-2">
            <ContractForm
              contractAddress={contractAddress}
              onClose={appContext.setEditForm}
            />
          </div>
        </div>
      )}
    </>
  );
};
