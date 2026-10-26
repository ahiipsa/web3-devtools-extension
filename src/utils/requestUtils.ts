import {
  ContractCall,
  RpcRequest,
  RpcRequestEstimateGas,
  RpcRequestCall,
} from "../types/main.ts";
import { Abi, AbiFunction, AbiParameter } from "viem";

export function isContractCall(
  request: RpcRequest,
): request is RpcRequestCall | RpcRequestEstimateGas {
  return (
    request.requestBody.method === "eth_call" ||
    request.requestBody.method === "eth_estimateGas"
  );
}

export function getContractAddress(request: RpcRequest) {
  if (isContractCall(request)) {
    return getContractCallParams(request).to;
  }

  return null;
}

export function getContractCallParams(request: RpcRequest): ContractCall {
  if (isContractCall(request)) {
    return request.requestBody.params[0];
  }

  throw new Error("Invalid contract call request");
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
