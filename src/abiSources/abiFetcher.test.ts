import { describe, expect, it, vi } from "vitest";
import { Abi, encodeFunctionData, getAddress, parseAbi } from "viem";
import { RpcRequest } from "../types/main.ts";
import { Contract } from "../dal/contract.ts";
import { ContractAbi } from "./abiSources.ts";
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

const MULTICALL = "0xca11bde05977b3631167028862be2a173976ca11";
const AGGREGATE3_ABI = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);

// A Multicall3 aggregate3 bundling a totalSupply() call to each target
const multicallOn = (url: string, targets: string[]) =>
  rpcRequest(
    url,
    "eth_call",
    [
      {
        to: MULTICALL,
        data: encodeFunctionData({
          abi: AGGREGATE3_ABI,
          functionName: "aggregate3",
          args: [
            targets.map((target) => ({
              target: target as `0x${string}`,
              allowFailure: true,
              callData: "0x18160ddd" as const,
            })),
          ],
        }),
      },
      "latest",
    ],
    "0x",
  );

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (
  options: {
    contracts?: Record<string, Contract>;
    fetchAbi?: (
      chainId: number,
      address: string,
      endpoint: string,
    ) => Promise<ContractAbi>;
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
        (async (): Promise<ContractAbi> => ({
          kind: "found",
          name: "WETH9",
          abi: ABI,
          source: "sourcify",
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
    expect(deps.fetchAbi).toHaveBeenCalledWith(1, WETH, ENDPOINT);
  });

  it("is asked of the Endpoint when its eth_chainId was not captured", async () => {
    const { fetcher, deps } = setup();

    fetcher.observe(
      [chainIdOn(ENDPOINT, "0x1"), callOn(OTHER_ENDPOINT, WETH)],
      true,
    );
    await flush();

    expect(deps.requestChainId).toHaveBeenCalledWith(OTHER_ENDPOINT);
    expect(deps.fetchAbi).toHaveBeenCalledWith(137, WETH, OTHER_ENDPOINT);
  });

  it("waits a moment for the page's own eth_chainId before asking the Endpoint", async () => {
    const { fetcher, deps } = setup({ chainLookupDelay: 20 });
    const call = callOn(ENDPOINT, WETH);

    fetcher.observe([call], true);
    fetcher.observe([call, chainIdOn(ENDPOINT, "0x1")], true);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(deps.requestChainId).not.toHaveBeenCalled();
    expect(deps.fetchAbi).toHaveBeenCalledWith(1, WETH, ENDPOINT);
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
      [1, WETH, ENDPOINT],
      [8453, DAI, ENDPOINT],
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
      fetchAbi: async () => ({ kind: "not-found", sources: ["sourcify"] }),
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
      [1, WETH, ENDPOINT],
      [137, WETH, OTHER_ENDPOINT],
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

  it("marks a Contract found on Etherscan as from Etherscan", async () => {
    const { fetcher, contracts } = setup({
      fetchAbi: async () => ({
        kind: "found",
        name: "WETH9",
        abi: ABI,
        source: "etherscan",
      }),
    });

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(contracts[WETH]).toMatchObject({ source: "etherscan" });
  });

  it("saves a proxy's Contract at the proxy's address, marked via proxy", async () => {
    const proxy = {
      implementation: DAI,
      abi: "implementation",
    } as const;
    const { fetcher, contracts } = setup({
      fetchAbi: async () => ({
        kind: "found",
        name: "FiatTokenV2_2",
        abi: ABI,
        source: "sourcify",
        proxy,
      }),
    });

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(contracts[WETH]).toEqual({
      address: WETH,
      name: "FiatTokenV2_2",
      abi: ABI,
      source: "sourcify",
      proxy,
    });
    expect(contracts[DAI]).toBeUndefined();
  });

  it("reports a miss on every ABI Source asked", async () => {
    const { fetcher } = setup({
      fetchAbi: async () => ({
        kind: "not-found",
        sources: ["sourcify", "etherscan"],
      }),
    });

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(fetcher.getState(ENDPOINT, WETH)).toEqual({
      kind: "not-found",
      sources: ["sourcify", "etherscan"],
    });
  });

  it("names a found Contract without a compilation name by its short address", async () => {
    const { fetcher, contracts } = setup({
      fetchAbi: async () => ({
        kind: "found",
        name: "",
        abi: ABI,
        source: "sourcify",
      }),
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
      fetchAbi: async () => ({ kind: "not-found", sources: ["sourcify"] }),
    });

    fetcher.observe([chainIdOn(ENDPOINT, "0x1"), callOn(ENDPOINT, WETH)], true);
    await flush();

    expect(fetcher.getState(ENDPOINT, WETH)).toEqual({
      kind: "not-found",
      sources: ["sourcify"],
    });
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
    expect(deps.fetchAbi).toHaveBeenCalledWith(137, WETH, OTHER_ENDPOINT);
    expect(contracts[WETH]).toMatchObject({ source: "sourcify" });
  });
});

describe("Fetching on demand", () => {
  it("retries an address that was not found", async () => {
    const { fetcher, deps } = setup({
      fetchAbi: async () => ({ kind: "not-found", sources: ["sourcify"] }),
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
    expect(deps.fetchAbi).toHaveBeenCalledWith(1, WETH, ENDPOINT);
  });
});

describe("Inner Call targets of a Multicall", () => {
  it("are fetched on the Endpoint's Chain, like the Multicall's own address", async () => {
    const { fetcher, deps } = setup();

    fetcher.observe(
      [chainIdOn(ENDPOINT, "0x1"), multicallOn(ENDPOINT, [WETH, DAI])],
      true,
    );
    await flush();

    expect(deps.fetchAbi.mock.calls).toEqual([
      [1, MULTICALL, ENDPOINT],
      [1, WETH, ENDPOINT],
      [1, DAI, ENDPOINT],
    ]);
  });

  it("are fetched once each, however often they are bundled", async () => {
    const { fetcher, deps } = setup({
      fetchAbi: async () => ({ kind: "not-found", sources: ["sourcify"] }),
    });
    const requests = [
      chainIdOn(ENDPOINT, "0x1"),
      multicallOn(ENDPOINT, [WETH, getAddress(WETH), DAI]),
      multicallOn(ENDPOINT, [DAI]),
      callOn(ENDPOINT, WETH),
    ];

    fetcher.observe(requests, true);
    await flush();
    fetcher.observe([...requests, multicallOn(ENDPOINT, [WETH])], true);
    await flush();

    expect(deps.fetchAbi.mock.calls).toEqual([
      [1, MULTICALL, ENDPOINT],
      [1, WETH, ENDPOINT],
      [1, DAI, ENDPOINT],
    ]);
  });

  it("wait with the Multicall's own address for the Endpoint's Chain", async () => {
    const { fetcher, deps } = setup({
      fetchAbi: () => new Promise(() => {}),
    });

    fetcher.observe([multicallOn(OTHER_ENDPOINT, [WETH])], true);

    expect(fetcher.getState(OTHER_ENDPOINT, WETH)).toEqual({
      kind: "fetching",
    });
    await flush();
    expect(deps.requestChainId).toHaveBeenCalledTimes(1);
    expect(deps.fetchAbi).toHaveBeenCalledWith(137, WETH, OTHER_ENDPOINT);
  });

  it("are not fetched while automatic fetching is off, but can be on demand", async () => {
    const { fetcher, deps, contracts } = setup();

    fetcher.observe(
      [chainIdOn(ENDPOINT, "0x1"), multicallOn(ENDPOINT, [WETH, DAI])],
      false,
    );
    await flush();

    expect(deps.fetchAbi).not.toHaveBeenCalled();
    expect(fetcher.getState(ENDPOINT, WETH)).toEqual({ kind: "idle" });

    await fetcher.fetchManually(ENDPOINT, WETH);

    expect(deps.fetchAbi.mock.calls).toEqual([[1, WETH, ENDPOINT]]);
    expect(contracts[WETH]).toMatchObject({ source: "sourcify" });
  });
});

describe("ABI Source fetches at once", () => {
  const TARGETS = Array.from(
    { length: 6 },
    (_, index) => `0x${String(index + 1).repeat(40)}` as const,
  );

  it("are never more than 4; the rest queue and start as others finish", async () => {
    const pending: (() => void)[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const { fetcher, deps } = setup({
      fetchAbi: () => {
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        return new Promise((resolve) =>
          pending.push(() => {
            inFlight--;
            resolve({ kind: "not-found", sources: ["sourcify"] });
          }),
        );
      },
    });

    fetcher.observe(
      [chainIdOn(ENDPOINT, "0x1"), multicallOn(ENDPOINT, TARGETS)],
      true,
    );
    await flush();

    expect(deps.fetchAbi).toHaveBeenCalledTimes(4);
    expect(fetcher.getState(ENDPOINT, TARGETS[5])).toEqual({
      kind: "fetching",
    });

    pending.shift()?.();
    await flush();
    expect(deps.fetchAbi).toHaveBeenCalledTimes(5);

    while (pending.length > 0) {
      pending.shift()?.();
      await flush();
    }
    expect(deps.fetchAbi).toHaveBeenCalledTimes(7);
    expect(maxInFlight).toBe(4);
    expect(fetcher.getState(ENDPOINT, TARGETS[5])).toEqual({
      kind: "not-found",
      sources: ["sourcify"],
    });
  });

  it("start a Fetch ABI press before the queued automatic fetches", async () => {
    const pending: (() => void)[] = [];
    const { fetcher, deps } = setup({
      fetchAbi: () =>
        new Promise((resolve) =>
          pending.push(() =>
            resolve({ kind: "not-found", sources: ["sourcify"] }),
          ),
        ),
    });
    fetcher.observe(
      [chainIdOn(ENDPOINT, "0x1"), multicallOn(ENDPOINT, TARGETS)],
      true,
    );
    await flush();

    void fetcher.fetchManually(ENDPOINT, WETH);
    await flush();
    pending.shift()?.();
    await flush();

    expect(deps.fetchAbi.mock.calls.at(-1)).toEqual([1, WETH, ENDPOINT]);
  });

  it("skip a queued address whose Contract was saved while it waited", async () => {
    const pending: (() => void)[] = [];
    const { fetcher, deps, contracts } = setup({
      fetchAbi: () =>
        new Promise((resolve) =>
          pending.push(() =>
            resolve({ kind: "not-found", sources: ["sourcify"] }),
          ),
        ),
    });
    fetcher.observe(
      [chainIdOn(ENDPOINT, "0x1"), multicallOn(ENDPOINT, TARGETS)],
      true,
    );
    await flush();

    contracts[TARGETS[3]] = { address: TARGETS[3], name: "Mine", abi: ABI };
    contracts[TARGETS[4]] = { address: TARGETS[4], name: "Mine", abi: ABI };
    pending.shift()?.();
    await flush();

    expect(deps.fetchAbi.mock.calls.at(-1)).toEqual([1, TARGETS[5], ENDPOINT]);
    expect(fetcher.getState(ENDPOINT, TARGETS[4])).toEqual({ kind: "idle" });
  });

  it("keep queueing after a fetch fails", async () => {
    let calls = 0;
    const { fetcher, deps } = setup({
      fetchAbi: async () => {
        if (++calls <= 4) {
          throw new Error("HTTP 500");
        }
        return { kind: "not-found", sources: ["sourcify"] };
      },
    });

    fetcher.observe(
      [chainIdOn(ENDPOINT, "0x1"), multicallOn(ENDPOINT, TARGETS)],
      true,
    );
    await flush();

    expect(deps.fetchAbi).toHaveBeenCalledTimes(7);
    expect(fetcher.getState(ENDPOINT, TARGETS[0])).toMatchObject({
      kind: "failed",
    });
    expect(fetcher.getState(ENDPOINT, TARGETS[5])).toMatchObject({
      kind: "not-found",
    });
  });
});
