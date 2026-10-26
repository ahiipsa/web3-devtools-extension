import { RpcRequest, RpcRequestStatus } from "../types/main.ts";

const isHttpSuccess = (httpStatus: number) =>
  httpStatus >= 200 && httpStatus < 300;

export function getRpcRequestStatus({
  response,
  httpStatus,
}: Pick<RpcRequest, "response" | "httpStatus">): RpcRequestStatus | undefined {
  if (response?.error) {
    const { code, message } = response.error;
    return { kind: "error", code, message };
  }

  if (response && "result" in response) {
    return { kind: "ok" };
  }

  if (!response && !isHttpSuccess(httpStatus)) {
    return { kind: "http", code: httpStatus };
  }

  return undefined;
}
