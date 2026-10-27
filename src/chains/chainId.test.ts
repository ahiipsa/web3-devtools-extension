import { describe, expect, it, vi } from "vitest";
import { RpcRequest } from "../types/main.ts";
import { getCapturedChainId, requestChainId } from "./chainId.ts";

const ENDPOINT = "https://rpc.example/v1";

const rpcRequest = (
  method: string,
  response?: RpcRequest["response"],
): RpcRequest => ({
  id: "1",
  url: ENDPOINT,
  requestBody: { jsonrpc: "2.0", id: 1, method },
  response,
  methodCategory: "Chain",
  startedDateTime: "2026-01-01T00:00:00.000Z",
  time: 10,
  httpStatus: 200,
  hasRpcResponseBody: true,
});

describe("getCapturedChainId", () => {
  it("reads the chain id from an eth_chainId RPC Response", () => {
    expect(
      getCapturedChainId(
        rpcRequest("eth_chainId", { jsonrpc: "2.0", id: 1, result: "0x89" }),
      ),
    ).toBe(137);
  });

  it.each([
    [
      "another method",
      rpcRequest("eth_blockNumber", { jsonrpc: "2.0", id: 1, result: "0x1" }),
    ],
    ["no RPC Response", rpcRequest("eth_chainId")],
    [
      "an RPC error",
      rpcRequest("eth_chainId", {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "nope" },
      }),
    ],
    [
      "a result that is not hex",
      rpcRequest("eth_chainId", { jsonrpc: "2.0", id: 1, result: "1" }),
    ],
  ])("has none for %s", (_case, request) => {
    expect(getCapturedChainId(request)).toBeUndefined();
  });
});

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("requestChainId", () => {
  it("sends one eth_chainId POST to the Endpoint and reads its result", async () => {
    const fetchFn = respond(200, { jsonrpc: "2.0", id: 1, result: "0x1" });

    expect(await requestChainId(ENDPOINT, fetchFn)).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      method: "eth_chainId",
    });
  });

  it("fails on an HTTP error", async () => {
    await expect(requestChainId(ENDPOINT, respond(401, {}))).rejects.toThrow(
      "HTTP 401",
    );
  });

  it("fails on an RPC error", async () => {
    const fetchFn = respond(200, {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "method not found" },
    });
    await expect(requestChainId(ENDPOINT, fetchFn)).rejects.toThrow(
      "method not found",
    );
  });
});
