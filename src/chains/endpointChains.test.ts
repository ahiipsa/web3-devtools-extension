import { describe, expect, it, vi } from "vitest";
import { RpcRequest } from "../types/main.ts";
import { createEndpointChains } from "./endpointChains.ts";

const ENDPOINT = "https://rpc.example/mainnet";
const OTHER_ENDPOINT = "https://rpc.example/polygon";

let nextId = 0;
const rpcRequest = (
  url: string,
  method: string,
  result?: unknown,
): RpcRequest => ({
  id: String(++nextId),
  url,
  requestBody: { jsonrpc: "2.0", id: nextId, method },
  response: { jsonrpc: "2.0", id: nextId, result },
  methodCategory: "Chain",
  startedDateTime: "2026-01-01T00:00:00.000Z",
  time: 10,
  httpStatus: 200,
  hasRpcResponseBody: true,
});

const chainIdOn = (url: string, chainId: string) =>
  rpcRequest(url, "eth_chainId", chainId);

const blockNumberOn = (url: string) =>
  rpcRequest(url, "eth_blockNumber", "0x10");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (
  options: {
    requestChainId?: (endpoint: string) => Promise<number>;
    lookupDelay?: number;
  } = {},
) => {
  const requestChainId = vi.fn(options.requestChainId ?? (async () => 137));
  const chains = createEndpointChains({
    requestChainId,
    lookupDelay: options.lookupDelay ?? 0,
  });
  return { chains, requestChainId };
};

describe("Chain of an RPC Request", () => {
  it("is its Endpoint's Chain from a captured eth_chainId", async () => {
    const { chains, requestChainId } = setup();
    const chainId = chainIdOn(ENDPOINT, "0x1");
    const call = blockNumberOn(ENDPOINT);

    chains.observe([chainId, call]);
    await flush();

    expect(chains.getRequestChain(chainId)).toEqual({
      kind: "known",
      chainId: 1,
    });
    expect(chains.getRequestChain(call)).toEqual({ kind: "known", chainId: 1 });
    expect(requestChainId).not.toHaveBeenCalled();
  });

  it("is the Panel's own answer when the page sends no eth_chainId", async () => {
    const { chains, requestChainId } = setup();
    const call = blockNumberOn(OTHER_ENDPOINT);

    chains.observe([chainIdOn(ENDPOINT, "0x1"), call]);
    await flush();

    expect(requestChainId).toHaveBeenCalledWith(OTHER_ENDPOINT);
    expect(requestChainId).toHaveBeenCalledTimes(1);
    expect(chains.getRequestChain(call)).toEqual({
      kind: "known",
      chainId: 137,
    });
  });

  it("is being looked up until the Endpoint answers", async () => {
    const { chains } = setup({ requestChainId: () => new Promise(() => {}) });
    const call = blockNumberOn(ENDPOINT);

    chains.observe([call]);
    await flush();

    expect(chains.getRequestChain(call)).toEqual({ kind: "looking-up" });
  });

  it("is backfilled from a captured eth_chainId that arrives later", async () => {
    const { chains, requestChainId } = setup({ lookupDelay: 20 });
    const call = blockNumberOn(ENDPOINT);

    chains.observe([call]);
    expect(chains.getRequestChain(call)).toEqual({ kind: "looking-up" });
    chains.observe([call, chainIdOn(ENDPOINT, "0x2105")]);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(chains.getRequestChain(call)).toEqual({
      kind: "known",
      chainId: 8453,
    });
    expect(requestChainId).not.toHaveBeenCalled();
  });

  it("stays the one it was sent to after the Endpoint switches Chain", async () => {
    const { chains } = setup();
    const before = blockNumberOn(ENDPOINT);
    const after = blockNumberOn(ENDPOINT);

    chains.observe([chainIdOn(ENDPOINT, "0x1"), before]);
    chains.observe([chainIdOn(ENDPOINT, "0x7a69"), after]);

    expect(chains.getRequestChain(before)).toEqual({
      kind: "known",
      chainId: 1,
    });
    expect(chains.getRequestChain(after)).toEqual({
      kind: "known",
      chainId: 31337,
    });
    expect(chains.getChainId(ENDPOINT)).toBe(31337);
  });

  it("gives way to a captured eth_chainId over the Panel's own answer", async () => {
    const { chains } = setup();
    const call = blockNumberOn(ENDPOINT);

    chains.observe([call]);
    await flush();
    const later = blockNumberOn(ENDPOINT);
    chains.observe([chainIdOn(ENDPOINT, "0x1"), later]);

    expect(chains.getRequestChain(call)).toEqual({
      kind: "known",
      chainId: 137,
    });
    expect(chains.getRequestChain(later)).toEqual({
      kind: "known",
      chainId: 1,
    });
  });

  it("says why the lookup failed", async () => {
    const { chains, requestChainId } = setup({
      requestChainId: async () => {
        throw new Error("invalid eth_chainId response");
      },
    });
    const call = blockNumberOn(ENDPOINT);

    chains.observe([call, blockNumberOn(ENDPOINT)]);
    await flush();
    chains.observe([blockNumberOn(ENDPOINT)]);
    await flush();

    expect(chains.getRequestChain(call)).toEqual({
      kind: "failed",
      reason: "no chain id from the Endpoint: invalid eth_chainId response",
    });
    expect(requestChainId).toHaveBeenCalledTimes(1);
  });

  it("is backfilled after a failed lookup by a later eth_chainId", async () => {
    const { chains } = setup({
      requestChainId: async () => {
        throw new Error("HTTP 401");
      },
    });
    const call = blockNumberOn(ENDPOINT);

    chains.observe([call]);
    await flush();
    chains.observe([chainIdOn(ENDPOINT, "0x1")]);

    expect(chains.getRequestChain(call)).toEqual({ kind: "known", chainId: 1 });
  });

  it("stays the same object until it changes", async () => {
    const { chains } = setup();
    const call = blockNumberOn(ENDPOINT);

    chains.observe([chainIdOn(ENDPOINT, "0x1"), call]);

    expect(chains.getRequestChain(call)).toBe(chains.getRequestChain(call));
  });
});

describe("Looking up an Endpoint's Chain", () => {
  it("tells subscribers which Endpoint changed", async () => {
    const { chains } = setup();
    const listener = vi.fn();
    chains.subscribe(listener);

    chains.observe([blockNumberOn(OTHER_ENDPOINT)]);
    await flush();

    expect(listener).toHaveBeenLastCalledWith(OTHER_ENDPOINT);
    expect(chains.getChainId(OTHER_ENDPOINT)).toBe(137);
  });

  it("tells subscribers when new RPC Requests get a known Chain", () => {
    const { chains } = setup();
    chains.observe([chainIdOn(ENDPOINT, "0x1")]);
    const listener = vi.fn();
    chains.subscribe(listener);
    const version = chains.getVersion();

    chains.observe([blockNumberOn(ENDPOINT)]);

    expect(listener).toHaveBeenCalledWith(ENDPOINT);
    expect(chains.getVersion()).not.toBe(version);
  });

  it("asks the Endpoint again on demand after a failure", async () => {
    let calls = 0;
    const { chains, requestChainId } = setup({
      requestChainId: async () => {
        if (++calls === 1) {
          throw new Error("HTTP 502");
        }
        return 1;
      },
    });
    const call = blockNumberOn(ENDPOINT);
    chains.observe([call]);
    await flush();

    expect(await chains.lookUp(ENDPOINT)).toBe(1);
    expect(requestChainId).toHaveBeenCalledTimes(2);
    expect(chains.getRequestChain(call)).toEqual({ kind: "known", chainId: 1 });
  });
});
