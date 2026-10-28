import { HttpResponseBody, RpcRequest } from "../types/main.ts";
import { getMethodCategory } from "./getMethodCategory.ts";
import { getRpcRequestStatus } from "./getRpcRequestStatus.ts";
import { hasRpcResponseBody, parseRpcExchange } from "./parseRpcExchange.ts";

// How much of a failed RPC Request's HTTP response body is kept, in characters
export const HTTP_RESPONSE_BODY_LIMIT = 4 * 1024;

// One finished network entry, with its response body already decoded
export interface CapturedHttpExchange {
  url: string;
  startedDateTime: string;
  time: number;
  httpStatus: number;
  requestText: string;
  responseText: string;
}

const cutHttpResponseBody = (responseText: string): HttpResponseBody => ({
  text: responseText.slice(0, HTTP_RESPONSE_BODY_LIMIT),
  length: responseText.length,
});

// Ok and RPC errors explain themselves; any other Status needs the body
const keepsHttpResponseBody = (
  rpcRequest: Pick<RpcRequest, "response" | "httpStatus">,
) => {
  const { kind } = getRpcRequestStatus(rpcRequest);
  return kind !== "ok" && kind !== "error";
};

export function captureRpcRequests({
  url,
  startedDateTime,
  time,
  httpStatus,
  requestText,
  responseText,
}: CapturedHttpExchange): Omit<RpcRequest, "id">[] {
  const exchanges = parseRpcExchange(requestText, responseText);
  const responseIsRpc = hasRpcResponseBody(responseText);
  const isBatch = exchanges.length > 1;

  return exchanges.map((exchange, index) => ({
    ...exchange,
    url,
    methodCategory: getMethodCategory(exchange.requestBody.method),
    startedDateTime,
    time,
    httpStatus,
    hasRpcResponseBody: responseIsRpc,
    ...(isBatch && {
      batchPosition: { index: index + 1, size: exchanges.length },
    }),
    ...(keepsHttpResponseBody({ response: exchange.response, httpStatus }) && {
      httpResponseBody: cutHttpResponseBody(responseText),
    }),
  }));
}
