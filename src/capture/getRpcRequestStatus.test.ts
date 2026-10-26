import { describe, expect, it } from "vitest";
import { getRpcRequestStatus } from "./getRpcRequestStatus.ts";

describe("getRpcRequestStatus", () => {
  it("is ok when the RPC Response has a result", () => {
    expect(
      getRpcRequestStatus({
        httpStatus: 200,
        hasRpcResponseBody: true,
        response: { jsonrpc: "2.0", id: 1, result: "0x1" },
      }),
    ).toEqual({ kind: "ok" });
  });

  it("is ok when the result is null", () => {
    expect(
      getRpcRequestStatus({
        httpStatus: 200,
        hasRpcResponseBody: true,
        response: { jsonrpc: "2.0", id: 1, result: null },
      }),
    ).toEqual({ kind: "ok" });
  });

  it("is the JSON-RPC error code, keeping the message, when the RPC Response has an error", () => {
    expect(
      getRpcRequestStatus({
        httpStatus: 200,
        hasRpcResponseBody: true,
        response: {
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000, message: "execution reverted" },
        },
      }),
    ).toEqual({ kind: "error", code: -32000, message: "execution reverted" });
  });

  it("prefers the JSON-RPC error over a failed HTTP status", () => {
    expect(
      getRpcRequestStatus({
        httpStatus: 429,
        hasRpcResponseBody: true,
        response: {
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32005, message: "rate limited" },
        },
      }),
    ).toEqual({ kind: "error", code: -32005, message: "rate limited" });
  });

  it.each([400, 429, 500, 502])(
    "is HTTP %i when the HTTP request failed and the body is not JSON-RPC",
    (httpStatus) => {
      expect(
        getRpcRequestStatus({ httpStatus, hasRpcResponseBody: false }),
      ).toEqual({
        kind: "http",
        code: httpStatus,
      });
    },
  );

  it("is HTTP 0 when the request never got an HTTP response", () => {
    expect(
      getRpcRequestStatus({ httpStatus: 0, hasRpcResponseBody: false }),
    ).toEqual({
      kind: "http",
      code: 0,
    });
  });

  it("is none when HTTP succeeded but no RPC Response was paired", () => {
    expect(
      getRpcRequestStatus({ httpStatus: 200, hasRpcResponseBody: false }),
    ).toBeUndefined();
  });

  it("is none when a failed batch response is JSON-RPC but omits the RPC Request", () => {
    expect(
      getRpcRequestStatus({ httpStatus: 500, hasRpcResponseBody: true }),
    ).toBeUndefined();
  });

  it("is none when the RPC Response has neither a result nor an error", () => {
    expect(
      getRpcRequestStatus({
        httpStatus: 200,
        hasRpcResponseBody: true,
        response: { jsonrpc: "2.0", id: 1 },
      }),
    ).toBeUndefined();
  });
});
