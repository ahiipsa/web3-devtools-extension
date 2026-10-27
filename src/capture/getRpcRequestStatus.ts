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

  if (!response) {
    return isHttpSuccess(httpStatus)
      ? { kind: "no-response" }
      : { kind: "http", code: httpStatus };
  }

  return undefined;
}

// The one label for a status, shown in the table and the details
export function formatRpcRequestStatus(status: RpcRequestStatus | undefined) {
  switch (status?.kind) {
    case "ok":
      return "ok";
    case "error":
      return `error ${status.code}`;
    case "http":
      // Like the Network tab's (failed): refused, blocked or aborted
      return status.code === 0 ? "failed" : `HTTP ${status.code}`;
    case "no-response":
      return "no response";
    default:
      return undefined;
  }
}

export const isFailedRpcRequestStatus = (
  status: RpcRequestStatus | undefined,
) => status !== undefined && status.kind !== "ok";
