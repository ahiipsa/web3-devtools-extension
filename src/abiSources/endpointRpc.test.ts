import { describe, expect, it, vi } from "vitest";
import { EndpointTransport, sendRpcRequest } from "./endpointRpc.ts";
import { EndpointHttpResponse } from "./inspectedPagePost.ts";

const ENDPOINT = "https://stake.example/api/rpc?chainId=1";

const rpcResponse = (result: unknown) =>
  JSON.stringify({ jsonrpc: "2.0", id: "x", result });

// The Panel's fetch blocked by the Endpoint's CORS
const blockedByCors = () =>
  vi.fn(async () => {
    throw new TypeError("Failed to fetch");
  });

const transport = (
  fetchFn: typeof fetch,
  postFromPage: (
    endpoint: string,
    body: string,
    timeout: number,
  ) => Promise<EndpointHttpResponse> = vi.fn(async () => ({
    status: 200,
    text: rpcResponse("0x1"),
  })),
) => ({ fetch: fetchFn, postFromPage }) satisfies EndpointTransport;

describe("sendRpcRequest", () => {
  it("sends from the Panel and reads the result", async () => {
    const fetchFn = vi.fn(async () => new Response(rpcResponse("0x89")));
    const sent = transport(fetchFn);

    expect(await sendRpcRequest(ENDPOINT, "eth_chainId", [], sent)).toBe(
      "0x89",
    );
    expect(sent.postFromPage).not.toHaveBeenCalled();
  });

  it("marks the RPC Request as the Panel's by its id", async () => {
    const fetchFn = vi.fn(async () => new Response(rpcResponse("0x1")));
    await sendRpcRequest(ENDPOINT, "eth_chainId", [], transport(fetchFn));

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).id).toMatch(/^evm-rpc-inspector:\d+$/);
  });

  describe("on a network failure from the Panel", () => {
    it("sends the same RPC Request again from the inspected page", async () => {
      const fetchFn = blockedByCors();
      const sent = transport(fetchFn);

      expect(
        await sendRpcRequest(ENDPOINT, "eth_getStorageAt", ["0x1"], sent),
      ).toBe("0x1");
      const [, init] = fetchFn.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(sent.postFromPage).toHaveBeenCalledWith(
        ENDPOINT,
        init.body,
        10_000,
      );
      expect(JSON.parse(String(init.body))).toMatchObject({
        method: "eth_getStorageAt",
        params: ["0x1"],
      });
    });

    it("fails with the page-side error when the page fails too", async () => {
      const sent = transport(blockedByCors(), async () => {
        throw new Error("Failed to fetch from the page");
      });

      await expect(
        sendRpcRequest(ENDPOINT, "eth_chainId", [], sent),
      ).rejects.toThrow("Failed to fetch from the page");
    });

    it("fails on a page-side timeout like on the Panel's", async () => {
      const sent = transport(blockedByCors(), async () => {
        const error = new Error("the Endpoint did not answer in time");
        error.name = "TimeoutError";
        throw error;
      });

      await expect(
        sendRpcRequest(ENDPOINT, "eth_chainId", [], sent),
      ).rejects.toThrow("the Endpoint did not answer in 10 s");
    });

    it("fails on the page-side HTTP and RPC errors", async () => {
      await expect(
        sendRpcRequest(
          ENDPOINT,
          "eth_chainId",
          [],
          transport(blockedByCors(), async () => ({ status: 403, text: "" })),
        ),
      ).rejects.toThrow("HTTP 403");
      await expect(
        sendRpcRequest(
          ENDPOINT,
          "eth_chainId",
          [],
          transport(blockedByCors(), async () => ({
            status: 200,
            text: JSON.stringify({
              jsonrpc: "2.0",
              id: "x",
              error: { code: -32601, message: "method not found" },
            }),
          })),
        ),
      ).rejects.toThrow("method not found");
    });
  });

  describe("does not send from the page", () => {
    it.each([
      [
        "an HTTP 500",
        async () => new Response("oops", { status: 500 }),
        "HTTP 500",
      ],
      [
        "an RPC error",
        async () =>
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: "x",
              error: { code: -32000, message: "header not found" },
            }),
          ),
        "header not found",
      ],
      [
        "a timeout",
        async () => {
          throw new DOMException("signal timed out", "TimeoutError");
        },
        "the Endpoint did not answer in 10 s",
      ],
    ])("on %s", async (_case, fetchImpl, message) => {
      const sent = transport(vi.fn(fetchImpl));

      await expect(
        sendRpcRequest(ENDPOINT, "eth_chainId", [], sent),
      ).rejects.toThrow(message);
      expect(sent.postFromPage).not.toHaveBeenCalled();
    });
  });
});
