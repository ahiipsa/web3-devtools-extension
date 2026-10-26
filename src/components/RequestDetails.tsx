import { RpcRequest } from "../types/main.ts";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { useMemo } from "react";
import { Button } from "antd";
import { CloseOutlined, SettingOutlined } from "@ant-design/icons";
import {
  getContractCallParams,
  isContractCall,
  stringifyArgs,
} from "../utils/requestUtils.ts";
import { decodeRpcRequest } from "../decoding/decodeRpcRequest.ts";

interface RequestDetailsProps {
  request: RpcRequest;
  onClose: () => void;
  onEditContract: (open: boolean) => void;
}

export const RequestDetails = (props: RequestDetailsProps) => {
  const { request, onClose, onEditContract } = props;

  return (
    <div>
      <div className="px-1 py-1 border-b-1 flex flex-row gap-2">
        <Button size="small" type="text" onClick={onClose} shape="circle">
          <CloseOutlined />
        </Button>

        {isContractCall(request) && (
          <Button
            size="small"
            type="text"
            shape="circle"
            onClick={() => onEditContract(true)}
          >
            <SettingOutlined />
          </Button>
        )}
      </div>

      <div className="px-2 py-2 ">
        <table className="text-xs">
          <tbody>
            <tr>
              <td className="px-2 py-1 whitespace-nowrap">Request ID:</td>
              <td className="px-2 py-1">
                {request?.requestBody.id} {request.id}
              </td>
            </tr>
            <tr>
              <td className="px-2 py-1 whitespace-nowrap">RPC URL:</td>
              <td className="px-2 py-1">{request?.url}</td>
            </tr>
            <tr>
              <td className="px-2 py-1 whitespace-nowrap">RPC Method:</td>
              <td className="px-2 py-1">{request?.requestBody.method}</td>
            </tr>
            {isContractCall(request) && (
              <RowContractDetails request={request} />
            )}
            {request.response && (
              <tr>
                <td className="px-2 py-1 align-top whitespace-nowrap">
                  Response Raw:
                </td>
                <td className="px-2 py-1">
                  <div className="rounded-md border p-2 whitespace-pre-wrap break-all max-h-[100px] overflow-y-scroll">
                    {JSON.stringify(
                      request.response.error ?? request.response.result,
                      null,
                      4,
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RowContractDetails = (props: { request: RpcRequest }) => {
  const { request } = props;

  const callParams = getContractCallParams(request);

  const contractQuery = useContractQuery({
    contractAddress: callParams?.to,
  });

  const abi = contractQuery.data?.abi;

  const decoding = useMemo(
    () => (abi ? decodeRpcRequest(request, abi) : undefined),
    [abi, request],
  );

  if (!callParams) {
    return null;
  }

  return (
    <>
      <tr>
        <td className="px-2 py-1 whitespace-nowrap">Contract:</td>
        <td className="px-2 py-1 whitespace-pre-wrap break-all">
          {callParams.to}
        </td>
      </tr>
      <tr>
        <td className="px-2 py-1 whitespace-nowrap">Method:</td>
        <td className="px-2 py-1">
          <p className="flex flex-row gap-1">
            {callParams.data && <span>{callParams.data.slice(0, 10)}</span>}

            {decoding?.status === "decoded" && (
              <span className="font-bold">{decoding.signature}</span>
            )}
          </p>
        </td>
      </tr>
      <tr>
        <td className="px-2 py-1 align-top whitespace-nowrap">Raw input:</td>
        <td className="px-2 py-1">
          <div className="rounded-md border p-2 whitespace-pre-wrap break-all max-h-[100px] overflow-y-scroll">
            {callParams.data}
          </div>
        </td>
      </tr>
      {decoding?.status === "mismatch" && (
        <tr>
          <td className="px-2 py-1 align-top whitespace-nowrap">
            Decoded input
          </td>
          <td className="px-2 py-1 text-red-500">
            The Contract&apos;s ABI does not match this RPC Request
          </td>
        </tr>
      )}
      {decoding?.status === "decoded" && (
        <>
          <tr>
            <td className="px-2 py-1 align-top whitespace-nowrap">
              Decoded input
            </td>
            <td className="px-2 py-1">{stringifyArgs(decoding.args)}</td>
          </tr>
          {"returnValue" in decoding && (
            <tr>
              <td className="px-2 py-1 align-top whitespace-nowrap">
                Decoded return value:
              </td>
              <td className="px-2 py-1">
                {stringifyArgs(decoding.returnValue)}
              </td>
            </tr>
          )}
          {decoding.returnValueMismatch && (
            <tr>
              <td className="px-2 py-1 align-top whitespace-nowrap">
                Decoded return value:
              </td>
              <td className="px-2 py-1 text-red-500">
                The RPC Response does not match the Contract&apos;s ABI
              </td>
            </tr>
          )}
        </>
      )}
    </>
  );
};
