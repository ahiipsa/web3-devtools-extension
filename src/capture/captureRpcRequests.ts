import { HttpResponseBody, RpcRequest } from "../types/main.ts";
import { getMethodCategory } from "./getMethodCategory.ts";
import { getRpcRequestStatus } from "./getRpcRequestStatus.ts";
import { hasRpcResponseBody, parseRpcExchange } from "./parseRpcExchange.ts";

// How much of a failed RPC Request's HTTP response body is kept, in characters
export const HTTP_RESPONSE_BODY_LIMIT = 4 * 1024;

// One finished network entry, with its response body already decoded
export interface CapturedNetworkEntry {
  url: string;
  startedDateTime: string;
  time: number;
  httpStatus: number;
  requestText: string;
  responseText: string;
}

const isHighSurrogate = (charCode: number) =>
  charCode >= 0xd800 && charCode <= 0xdbff;

const cutHttpResponseBody = (responseText: string): HttpResponseBody => {
  // Never split a surrogate pair, so the kept text stays valid
  const end = isHighSurrogate(
    responseText.charCodeAt(HTTP_RESPONSE_BODY_LIMIT - 1),
  )
    ? HTTP_RESPONSE_BODY_LIMIT - 1
    : HTTP_RESPONSE_BODY_LIMIT;
  return { text: responseText.slice(0, end), length: responseText.length };
};

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
}: CapturedNetworkEntry): Omit<RpcRequest, "id">[] {
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
