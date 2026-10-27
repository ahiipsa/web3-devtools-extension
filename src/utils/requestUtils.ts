import { ContractCall, RpcRequest } from "../types/main.ts";

const CONTRACT_CALL_METHODS = [
  "eth_call",
  "eth_estimateGas",
  "eth_sendTransaction",
];

export function isContractCall(request: RpcRequest): boolean {
  return getContractCallParams(request) !== undefined;
}

export function getContractAddress(request: RpcRequest) {
  return getContractCallParams(request)?.to ?? null;
}

export function getContractCallParams(
  request: RpcRequest,
): ContractCall | undefined {
  const { method, params } = request.requestBody;
  if (!CONTRACT_CALL_METHODS.includes(method) || !Array.isArray(params)) {
    return undefined;
  }

  const [call] = params;
  if (
    typeof call !== "object" ||
    call === null ||
    typeof call.to !== "string"
  ) {
    return undefined;
  }

  return { ...call, data: call.data ?? call.input };
}
