import { RpcRequest, RpcRequestStatus } from "../types/main.ts";

const isHttpSuccess = (httpStatus: number) =>
  httpStatus >= 200 && httpStatus < 300;

export function getRpcRequestStatus({
  response,
  httpStatus,
  hasRpcResponseBody,
}: Pick<RpcRequest, "response" | "httpStatus" | "hasRpcResponseBody">):
  | RpcRequestStatus
  | undefined {
  if (response?.error) {
    const { code, message } = response.error;
    return { kind: "error", code, message };
  }

  if (response && "result" in response) {
    return { kind: "ok" };
  }

  if (!response && !hasRpcResponseBody && !isHttpSuccess(httpStatus)) {
    return { kind: "http", code: httpStatus };
  }

  return undefined;
}
