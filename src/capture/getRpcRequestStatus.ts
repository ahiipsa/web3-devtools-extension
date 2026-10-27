import { RpcRequest, RpcRequestStatus } from "../types/main.ts";

const isHttpSuccess = (httpStatus: number) =>
  httpStatus >= 200 && httpStatus < 300;

export function getRpcRequestStatus({
  response,
  httpStatus,
}: Pick<RpcRequest, "response" | "httpStatus">): RpcRequestStatus {
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

  return { kind: "invalid-response" };
}

// The one label for a status, shown in the table and the details
export function formatRpcRequestStatus(status: RpcRequestStatus) {
  switch (status.kind) {
    case "ok":
      return "ok";
    case "error":
      return `error ${status.code}`;
    case "http":
      // Like the Network tab's (failed): refused, blocked or aborted
      return status.code === 0 ? "failed" : `HTTP ${status.code}`;
    case "no-response":
      return "no response";
    case "invalid-response":
      return "invalid response";
  }
}

export const isFailedRpcRequestStatus = (status: RpcRequestStatus) =>
  status.kind !== "ok";
