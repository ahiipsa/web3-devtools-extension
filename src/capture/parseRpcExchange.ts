import { RpcRequest, RpcRequestBody, RpcResponseBody } from "../types/main.ts";

export type RpcExchange = Pick<RpcRequest, "requestBody" | "response">;

const toArray = <T>(value: T | T[]): T[] =>
  Array.isArray(value) ? value : [value];

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const isRpcRequestBody = (value: unknown): value is RpcRequestBody =>
  typeof value === "object" &&
  value !== null &&
  (value as RpcRequestBody).jsonrpc === "2.0" &&
  typeof (value as RpcRequestBody).method === "string";

const isRpcResponseBody = (value: unknown): value is RpcResponseBody =>
  typeof value === "object" &&
  value !== null &&
  (value as RpcResponseBody).jsonrpc === "2.0";

export function parseRpcExchange(
  requestText: string,
  responseText: string,
): RpcExchange[] {
  const requestBodies = toArray(parseJson(requestText)).filter(
    isRpcRequestBody,
  );
  const responses = toArray(parseJson(responseText)).filter(isRpcResponseBody);

  return requestBodies.map((requestBody) => ({
    requestBody,
    response: responses.find((response) => response.id === requestBody.id),
  }));
}
