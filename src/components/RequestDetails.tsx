import {
  RpcRequest,
  RpcRequestEstimateGas,
  RpcRequestCall,
} from "../types/main.ts";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { useABIQuery } from "../hooks/useABIQuery.ts";
import { Abi, decodeFunctionData, decodeFunctionResult } from "viem";
import { useMemo } from "react";
import { Button } from "antd";
import { CloseOutlined, SettingOutlined } from "@ant-design/icons";
import {
  buildFunctionSignatureFromAbi,
  getContractCallParams,
  isContractCall,
  stringifyArgs,
} from "../utils/requestUtils.ts";
import { responses } from "../hooks/useRpcRequestList.ts";
import { ErrorBoundary } from "react-error-boundary";

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
            {responses[request.requestBody.id] && (
              <tr>
                <td className="px-2 py-1 align-top whitespace-nowrap">
                  Response Raw:
                </td>
                <td className="px-2 py-1">
                  <div className="rounded-md border p-2 whitespace-pre-wrap break-all max-h-[100px] overflow-y-scroll">
                    {JSON.stringify(
                      responses[request.requestBody.id].result,
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

const RowContractDetails = (props: {
  request: RpcRequestCall | RpcRequestEstimateGas;
}) => {
  const { request } = props;

  const callParams = getContractCallParams(request);

  const contractQuery = useContractQuery({
    contractAddress: callParams.to,
  });

  const abiQuery = useABIQuery({ abiId: contractQuery.data?.abiId || "" });

  const abi: Abi | null = useMemo(() => {
    if (!abiQuery.data?.json) {
      return null;
    }

    try {
      return JSON.parse(abiQuery.data?.json);
    } catch (error) {
      return null;
    }
  }, [abiQuery.data?.json]);

  const functionData = useMemo(() => {
    if (callParams.data && abi) {
      try {
        return decodeFunctionData({
          abi: abi,
          data: callParams.data,
        });
      } catch {
        return null;
      }
    }

    return null;
  }, [abi, callParams.data]);

  const functionSignature = useMemo(() => {
    if (!functionData || !abi) {
      return "";
    }

    return buildFunctionSignatureFromAbi(
      functionData.functionName,
      functionData.args?.length || 0,
      abi,
    );
  }, [abi, functionData]);

  const hasContractAbi = !!abiQuery.data?.json;

  const _res = responses[request.requestBody.id];
  const response = useMemo(() => {
    if (_res && _res.result && abi && functionData) {
      try {
        return decodeFunctionResult({
          abi,
          functionName: functionData.functionName,
          data: responses[request.requestBody.id]
            .result as unknown as `0x${string}`,
        });
      } catch (error) {
        if (error instanceof Error) {
          return error.message;
        }

        return "decode error";
      }
    }
    return null;
  }, [abi, functionData, request.requestBody.id, _res]);

  return (
    <>
      {isContractCall(request) && (
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

                {functionSignature && (
                  <span className="font-bold">{functionSignature}</span>
                )}
              </p>
            </td>
          </tr>
          <tr>
            <td className="px-2 py-1 align-top whitespace-nowrap">
              Raw input:
            </td>
            <td className="px-2 py-1">
              <div className="rounded-md border p-2 whitespace-pre-wrap break-all max-h-[100px] overflow-y-scroll">
                {callParams.data}
              </div>
            </td>
          </tr>
        </>
      )}
      {hasContractAbi && callParams.data && !functionData && (
        <tr>
          <td className="px-2 py-1 align-top whitespace-nowrap">
            Decoded input
          </td>
          <td className="px-2 py-1 text-red-500">
            The Contract's ABI does not match this RPC Request
          </td>
        </tr>
      )}
      {hasContractAbi && functionData && (
        <>
          <tr>
            <td className="px-2 py-1 align-top whitespace-nowrap">
              Decoded input
            </td>
            <td className="px-2 py-1">
              {functionData.args && stringifyArgs(functionData.args)}
            </td>
          </tr>
          {response && abi && functionData && (
            <tr>
              <td className="px-2 py-1 align-top whitespace-nowrap">
                Decoded Response:
              </td>
              <td className={`px-2 py-1`}>
                <ErrorBoundary fallback={<div>Error</div>}>
                  {
                    JSON.stringify(
                      response,
                      function (_key, value) {
                        if (typeof value === "bigint") {
                          return value.toString();
                        } else {
                          return value;
                        }
                      },
                      4,
                    ) as string
                  }
                </ErrorBoundary>
              </td>
            </tr>
          )}
        </>
      )}
    </>
  );
};
