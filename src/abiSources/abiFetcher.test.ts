import { describe, expect, it, vi } from "vitest";
import { Abi } from "viem";
import { RpcRequest } from "../types/main.ts";
import { Contract } from "../dal/contract.ts";
import { AbiSourceResult } from "./sourcify.ts";
import { createAbiFetcher } from "./abiFetcher.ts";

const ENDPOINT = "https://rpc.example/mainnet";
const OTHER_ENDPOINT = "https://rpc.example/polygon";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";

const ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

let nextId = 0;
const rpcRequest = (
  url: string,
  method: string,
  params?: unknown,
  result?: unknown,
): RpcRequest => ({
  id: String(++nextId),
  url,
  requestBody: { jsonrpc: "2.0", id: nextId, method, params },
  response: { jsonrpc: "2.0", id: nextId, result },
  methodCategory: "Calls",
  startedDateTime: "2026-01-01T00:00:00.000Z",
  time: 10,
  httpStatus: 200,
  hasRpcResponseBody: true,
});

const chainIdOn = (url: string, chainId: string) =>
  rpcRequest(url, "eth_chainId", [], chainId);

const callOn = (url: string, to: string) =>
  rpcRequest(url, "eth_call", [{ to, data: "0x18160ddd" }, "latest"], "0x");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (
  options: {
    contracts?: Record<string, Contract>;
    fetchAbi?: (chainId: number, address: string) => Promise<AbiSourceResult>;
    requestChainId?: (endpoint: string) => Promise<number>;
    chainLookupDelay?: number;
  } = {},
) => {
  const contracts: Record<string, Contract> = { ...options.contracts };
  const deps = {
    getContract: vi.fn(
      async (address: `0x${string}`) =>
        contracts[address.toLowerCase()] ?? null,
    ),
    saveFetchedContract: vi.fn(async (contract: Contract) => {
      const address = contract.address.toLowerCase();
      if (contracts[address]) {
        return false;
      }
      contracts[address] = contract;
      return true;
    }),
    fetchAbi: vi.fn(
      options.fetchAbi ??
        (async (): Promise<AbiSourceResult> => ({
          kind: "found",
          name: "WETH9",
          abi: ABI,
        })),
    ),
    requestChainId: vi.fn(options.requestChainId ?? (async () => 137)),
    chainLookupDelay: options.chainLookupDelay ?? 0,
  };
  return { fetcher: createAbiFetcher(deps), deps, contracts };
};

describe("Chain of an Endpoint", () => {
  it("is taken from an eth_chainId RPC Response captured on the same Endpoint", async () => {
    const { fetcher, deps } = setup();

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(deps.requestChainId).not.toHaveBeenCalled();
    expect(deps.fetchAbi).toHaveBeenCalledWith(1, WETH);
  });

  it("is asked of the Endpoint when its eth_chainId was not captured", async () => {
    const { fetcher, deps } = setup();

    fetcher.observe(
      [chainIdOn(ENDPOINT, "0x1"), callOn(OTHER_ENDPOINT, WETH)],
      true,
    );
    await flush();

    expect(deps.requestChainId).toHaveBeenCalledWith(OTHER_ENDPOINT);
    expect(deps.fetchAbi).toHaveBeenCalledWith(137, WETH);
  });

  it("waits a moment for the page's own eth_chainId before asking the Endpoint", async () => {
    const { fetcher, deps } = setup({ chainLookupDelay: 20 });
    const call = callOn(ENDPOINT, WETH);

    fetcher.observe([call], true);
    fetcher.observe([call, chainIdOn(ENDPOINT, "0x1")], true);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(deps.requestChainId).not.toHaveBeenCalled();
    expect(deps.fetchAbi).toHaveBeenCalledWith(1, WETH);
  });

  it("follows a later eth_chainId of the Endpoint that names another Chain", async () => {
    const { fetcher, deps } = setup();
    const first = [chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)];

    fetcher.observe(first, true);
    await flush();
    fetcher.observe(
      [...first, chainIdOn(ENDPOINT, "0x2105"), callOn(ENDPOINT, DAI)],
      true,
    );
    await flush();

    expect(deps.fetchAbi.mock.calls).toEqual([
      [1, WETH],
      [8453, DAI],
    ]);
  });

  it("is asked of an Endpoint at most once, even when that fails", async () => {
    const { fetcher, deps } = setup({
      requestChainId: async () => {
        throw new Error("HTTP 401");
      },
    });

    fetcher.observe([callOn(ENDPOINT, WETH), callOn(ENDPOINT, DAI)], true);
    await flush();
    fetcher.observe([callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(deps.requestChainId).toHaveBeenCalledTimes(1);
    expect(deps.fetchAbi).not.toHaveBeenCalled();
    expect(fetcher.getState(ENDPOINT, WETH)).toEqual({
      kind: "failed",
      reason: "no chain id from the Endpoint: HTTP 401",
    });
  });
});

describe("Fetching a Contract's ABI", () => {
  it("fetches once per Chain and address", async () => {
    const { fetcher, deps } = setup();
    const requests = [chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)];

    fetcher.observe(requests, true);
    fetcher.observe([...requests, callOn(ENDPOINT, WETH.toUpperCase())], true);
    await flush();
    fetcher.observe([callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(deps.fetchAbi).toHaveBeenCalledTimes(1);
  });

  it("fetches the same address again on another Chain", async () => {
    const { fetcher, deps } = setup({
      fetchAbi: async () => ({ kind: "not-found" }),
    });

    fetcher.observe(
      [
        chainIdOn(ENDPOINT, "0x1"),
        chainIdOn(OTHER_ENDPOINT, "0x89"),
        callOn(ENDPOINT, WETH),
        callOn(OTHER_ENDPOINT, WETH),
      ],
      true,
    );
    await flush();

    expect(deps.fetchAbi.mock.calls).toEqual([
      [1, WETH],
      [137, WETH],
    ]);
  });

  it("never fetches for an address that has a Contract", async () => {
    const mine: Contract = { address: WETH, name: "Mine", abi: ABI };
    const { fetcher, deps, contracts } = setup({ contracts: { [WETH]: mine } });

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(deps.fetchAbi).not.toHaveBeenCalled();
    expect(contracts[WETH]).toBe(mine);
  });

  it("saves a found ABI as a Contract named after it, marked as from Sourcify", async () => {
    const { fetcher, contracts } = setup();

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(contracts[WETH]).toEqual({
      address: WETH,
      name: "WETH9",
      abi: ABI,
      source: "sourcify",
    });
  });

  it("names a found Contract without a compilation name by its short address", async () => {
    const { fetcher, contracts } = setup({
      fetchAbi: async () => ({ kind: "found", name: "", abi: ABI }),
    });

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(contracts[WETH].name).toBe("0xc02a...6cc2");
  });

  it("is fetching while Sourcify has not answered", async () => {
    const { fetcher } = setup({ fetchAbi: () => new Promise(() => {}) });

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(fetcher.getState(ENDPOINT, WETH)).toEqual({ kind: "fetching" });
  });

  it("reports no verified ABI on 404", async () => {
    const { fetcher, contracts } = setup({
      fetchAbi: async () => ({ kind: "not-found" }),
    });

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(fetcher.getState(ENDPOINT, WETH)).toEqual({ kind: "not-found" });
    expect(contracts).toEqual({});
  });

  it("reports why a fetch failed", async () => {
    const { fetcher } = setup({
      fetchAbi: async () => {
        throw new Error("HTTP 500");
      },
    });

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(fetcher.getState(ENDPOINT, WETH)).toEqual({
      kind: "failed",
      reason: "HTTP 500",
    });
  });

  it("tells subscribers when a state changes", async () => {
    const { fetcher } = setup();
    const listener = vi.fn();
    fetcher.subscribe(listener);

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(listener).toHaveBeenCalled();
  });
});

describe("Automatic fetching turned off", () => {
  it("fetches nothing and asks no Endpoint for its chain id", async () => {
    const { fetcher, deps } = setup();

    fetcher.observe(
      [
        chainIdOn(ENDPOINT, "0x1"),
        callOn(ENDPOINT, WETH),
        callOn(OTHER_ENDPOINT, DAI),
      ],
      false,
    );
    await flush();

    expect(deps.fetchAbi).not.toHaveBeenCalled();
    expect(deps.requestChainId).not.toHaveBeenCalled();
    expect(fetcher.getState(ENDPOINT, WETH)).toEqual({ kind: "idle" });
  });

  it("still fetches on demand, asking the Endpoint for its chain id", async () => {
    const { fetcher, deps, contracts } = setup();
    fetcher.observe([callOn(OTHER_ENDPOINT, WETH)], false);

    await fetcher.fetchManually(OTHER_ENDPOINT, WETH);

    expect(deps.requestChainId).toHaveBeenCalledWith(OTHER_ENDPOINT);
    expect(deps.fetchAbi).toHaveBeenCalledWith(137, WETH);
    expect(contracts[WETH]).toMatchObject({ source: "sourcify" });
  });
});

describe("Fetching on demand", () => {
  it("retries an address that was not found", async () => {
    const { fetcher, deps } = setup({
      fetchAbi: async () => ({ kind: "not-found" }),
    });
    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    await fetcher.fetchManually(ENDPOINT, WETH);

    expect(deps.fetchAbi).toHaveBeenCalledTimes(2);
  });

  it("asks the Endpoint for its chain id again after that failed", async () => {
    let calls = 0;
    const { fetcher, deps } = setup({
      requestChainId: async () => {
        if (++calls === 1) {
          throw new Error("HTTP 502");
        }
        return 1;
      },
    });
    fetcher.observe([callOn(ENDPOINT, WETH)], true);
    await flush();

    await fetcher.fetchManually(ENDPOINT, WETH);

    expect(deps.requestChainId).toHaveBeenCalledTimes(2);
    expect(deps.fetchAbi).toHaveBeenCalledWith(1, WETH);
  });
});
