import { describe, expect, it } from "vitest";
import { RpcRequestStatus } from "../types/main.ts";
import {
  formatRpcRequestStatus,
  getRpcRequestStatus,
  isFailedRpcRequestStatus,
} from "./getRpcRequestStatus.ts";

describe("getRpcRequestStatus", () => {
  it("is ok when the RPC Response has a result", () => {
    expect(
      getRpcRequestStatus({
        httpStatus: 200,
        response: { jsonrpc: "2.0", id: 1, result: "0x1" },
      }),
    ).toEqual({ kind: "ok" });
  });

  it("is ok when the result is null", () => {
    expect(
      getRpcRequestStatus({
        httpStatus: 200,
        response: { jsonrpc: "2.0", id: 1, result: null },
      }),
    ).toEqual({ kind: "ok" });
  });

  it("is the JSON-RPC error code, keeping the message, when the RPC Response has an error", () => {
    expect(
      getRpcRequestStatus({
        httpStatus: 200,
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
        response: {
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32005, message: "rate limited" },
        },
      }),
    ).toEqual({ kind: "error", code: -32005, message: "rate limited" });
  });

  it.each([400, 429, 500, 502])(
    "is HTTP %i when the HTTP request failed and no RPC Response was paired",
    (httpStatus) => {
      expect(getRpcRequestStatus({ httpStatus })).toEqual({
        kind: "http",
        code: httpStatus,
      });
    },
  );

  it("is HTTP 0 when the request never got an HTTP response", () => {
    expect(getRpcRequestStatus({ httpStatus: 0 })).toEqual({
      kind: "http",
      code: 0,
    });
  });

  it("is no response when HTTP succeeded but no RPC Response was paired", () => {
    expect(getRpcRequestStatus({ httpStatus: 200 })).toEqual({
      kind: "no-response",
    });
  });

  it("is an invalid response when the RPC Response has neither a result nor an error", () => {
    expect(
      getRpcRequestStatus({
        httpStatus: 200,
        response: { jsonrpc: "2.0", id: 1 },
      }),
    ).toEqual({ kind: "invalid-response" });
  });
});

describe("formatRpcRequestStatus", () => {
  it.each([
    [{ kind: "ok" } as const, "ok"],
    [
      { kind: "error", code: -32000, message: "execution reverted" } as const,
      "error -32000",
    ],
    [{ kind: "http", code: 500 } as const, "HTTP 500"],
    [{ kind: "http", code: 0 } as const, "failed"],
    [{ kind: "no-response" } as const, "no response"],
    [{ kind: "invalid-response" } as const, "invalid response"],
  ])("labels %o as %s", (status, label) => {
    expect(formatRpcRequestStatus(status)).toBe(label);
  });
});

describe("isFailedRpcRequestStatus", () => {
  it("is failed for every status but ok", () => {
    const statuses: RpcRequestStatus[] = [
      { kind: "ok" },
      { kind: "error", code: 3, message: "execution reverted" },
      { kind: "http", code: 500 },
      { kind: "http", code: 0 },
      { kind: "no-response" },
      { kind: "invalid-response" },
    ];
    expect(statuses.map(isFailedRpcRequestStatus)).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});
