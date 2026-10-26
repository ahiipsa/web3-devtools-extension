import { ContractCall, RpcRequest } from "../types/main.ts";
import { Abi, AbiFunction, AbiParameter } from "viem";

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

export function stringifyArgs(args: unknown[] | unknown): string {
  if (Array.isArray(args)) {
    return `[${args.map((arg) => stringifyArgs(arg)).join(", ")}]`;
  }

  if (typeof args === "object") {
    return JSON.stringify(
      args,
      function (_key, value) {
        if (typeof value === "bigint") {
          return value.toString();
        } else {
          return value;
        }
      },
      4,
    );
  }

  return String(args);
}

export function buildFunctionSignatureFromAbi(
  method: string,
  argsCount: number,
  abi: Abi,
): string {
  const abiElement = abi.find((item) => {
    if (
      item.type === "function" &&
      item.name === method &&
      item.inputs.length === argsCount
    ) {
      return item;
    }
    return false;
  }) as AbiFunction;

  if (!abiElement) {
    return method;
  }

  return `${method}(${abiElement.inputs.map((input: AbiParameter) => `${[input.type, input.name].filter(Boolean).join(" ")}`).join(", ")})`;
}
