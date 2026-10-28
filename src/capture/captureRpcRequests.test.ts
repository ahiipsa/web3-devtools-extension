import { describe, expect, it } from "vitest";
import {
  captureRpcRequests,
  CapturedNetworkEntry,
  HTTP_RESPONSE_BODY_LIMIT,
} from "./captureRpcRequests.ts";

const networkEntry = (
  overrides: Partial<CapturedNetworkEntry>,
): CapturedNetworkEntry => ({
  url: "https://rpc.example",
  startedDateTime: "2026-01-01T00:00:00.000Z",
  time: 42,
  httpStatus: 200,
  requestText: '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber"}',
  responseText: '{"jsonrpc":"2.0","id":1,"result":"0x10"}',
  ...overrides,
});

const batchOf = (size: number) =>
  JSON.stringify(
    Array.from({ length: size }, (_, i) => ({
      jsonrpc: "2.0",
      id: i + 1,
      method: "eth_chainId",
    })),
  );

describe("captureRpcRequests", () => {
  it("copies the network entry onto each RPC Request", () => {
    expect(captureRpcRequests(networkEntry({}))).toEqual([
      {
        url: "https://rpc.example",
        requestBody: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" },
        response: { jsonrpc: "2.0", id: 1, result: "0x10" },
        methodCategory: "Chain",
        startedDateTime: "2026-01-01T00:00:00.000Z",
        time: 42,
        httpStatus: 200,
        hasRpcResponseBody: true,
      },
    ]);
  });

  describe("Batch position", () => {
    it("numbers the RPC Requests of a Batch from 1, each knowing its size", () => {
      const captured = captureRpcRequests(
        networkEntry({ requestText: batchOf(12), responseText: "" }),
      );

      expect(captured.map((rpcRequest) => rpcRequest.batchPosition)).toEqual(
        Array.from({ length: 12 }, (_, i) => ({ index: i + 1, size: 12 })),
      );
    });

    it("gives a single POST no Batch position", () => {
      const [rpcRequest] = captureRpcRequests(networkEntry({}));

      expect(rpcRequest).not.toHaveProperty("batchPosition");
    });

    it("gives an array of one RPC Request no Batch position", () => {
      const [rpcRequest] = captureRpcRequests(
        networkEntry({ requestText: batchOf(1) }),
      );

      expect(rpcRequest).not.toHaveProperty("batchPosition");
    });

    it("counts only the RPC Requests, skipping entries that are not one", () => {
      const captured = captureRpcRequests(
        networkEntry({
          requestText: JSON.stringify([
            { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
            { not: "an RPC Request" },
            { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
          ]),
        }),
      );

      expect(captured.map((rpcRequest) => rpcRequest.batchPosition)).toEqual([
        { index: 1, size: 2 },
        { index: 2, size: 2 },
      ]);
    });
  });

  describe("HTTP response body", () => {
    it("keeps the first 4 KB and the full length of a long HTTP failure body", () => {
      const body = "<html>" + "x".repeat(18 * 1024 - 6);
      const [rpcRequest] = captureRpcRequests(
        networkEntry({ httpStatus: 502, responseText: body }),
      );

      expect(rpcRequest.httpResponseBody).toEqual({
        text: body.slice(0, HTTP_RESPONSE_BODY_LIMIT),
        length: 18 * 1024,
      });
      expect(HTTP_RESPONSE_BODY_LIMIT).toBe(4 * 1024);
    });

    it("keeps a body under 4 KB whole", () => {
      const [rpcRequest] = captureRpcRequests(
        networkEntry({ httpStatus: 429, responseText: "rate limit exceeded" }),
      );

      expect(rpcRequest.httpResponseBody).toEqual({
        text: "rate limit exceeded",
        length: 19,
      });
    });

    it("does not split a surrogate pair at the cut", () => {
      const body = "x".repeat(HTTP_RESPONSE_BODY_LIMIT - 1) + "😀" + "tail";
      const [rpcRequest] = captureRpcRequests(
        networkEntry({ httpStatus: 502, responseText: body }),
      );

      expect(rpcRequest.httpResponseBody?.text).toBe(
        "x".repeat(HTTP_RESPONSE_BODY_LIMIT - 1),
      );
      expect(rpcRequest.httpResponseBody?.length).toBe(body.length);
    });

    it("keeps the body of an RPC Request that got no HTTP response", () => {
      const [rpcRequest] = captureRpcRequests(
        networkEntry({ httpStatus: 0, responseText: "" }),
      );

      expect(rpcRequest.httpResponseBody).toEqual({ text: "", length: 0 });
    });

    it("keeps the body when it holds no RPC Response for the RPC Request", () => {
      const responseText = '{"jsonrpc":"2.0","id":99,"result":"0x1"}';
      const [rpcRequest] = captureRpcRequests(networkEntry({ responseText }));

      expect(rpcRequest.httpResponseBody).toEqual({
        text: responseText,
        length: responseText.length,
      });
    });

    it("keeps the body of an invalid response", () => {
      const responseText = '{"jsonrpc":"2.0","id":1}';
      const [rpcRequest] = captureRpcRequests(networkEntry({ responseText }));

      expect(rpcRequest.httpResponseBody).toEqual({
        text: responseText,
        length: responseText.length,
      });
    });

    it("keeps no body for an ok RPC Request", () => {
      const [rpcRequest] = captureRpcRequests(networkEntry({}));

      expect(rpcRequest).not.toHaveProperty("httpResponseBody");
    });

    it("keeps no body for an RPC error", () => {
      const [rpcRequest] = captureRpcRequests(
        networkEntry({
          responseText:
            '{"jsonrpc":"2.0","id":1,"error":{"code":3,"message":"execution reverted"}}',
        }),
      );

      expect(rpcRequest).not.toHaveProperty("httpResponseBody");
    });

    it("keeps the body only for the failed RPC Requests of a Batch", () => {
      const responseText = '[{"jsonrpc":"2.0","id":1,"result":"0x1"}]';
      const captured = captureRpcRequests(
        networkEntry({ requestText: batchOf(2), responseText }),
      );

      expect(captured[0]).not.toHaveProperty("httpResponseBody");
      expect(captured[1].httpResponseBody).toEqual({
        text: responseText,
        length: responseText.length,
      });
    });
  });
});
