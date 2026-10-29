import { describe, expect, it, vi } from "vitest";
import { Abi } from "viem";
import { AbiSourceResult } from "./sourcify.ts";
import { EtherscanResult } from "./etherscan.ts";
import {
  ContractAbi,
  EtherscanOutcome,
  fetchContractAbi,
  fetchFromAbiSources,
  SourcifyOutcome,
} from "./abiSources.ts";

const ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

const found = (name: string): AbiSourceResult => ({
  kind: "found",
  name,
  abi: ABI,
});
const NOT_FOUND: AbiSourceResult = { kind: "not-found" };

const missed = (
  sourcify: SourcifyOutcome,
  etherscan: EtherscanOutcome,
): ContractAbi => ({ kind: "missed", outcomes: { sourcify, etherscan } });
const sourcifyFailed = (reason: string): SourcifyOutcome => ({
  kind: "failed",
  reason,
});

const setup = (options: {
  sourcify: () => Promise<AbiSourceResult>;
  etherscan?: () => Promise<EtherscanResult>;
  apiKey?: string;
}) => {
  const sources = {
    sourcify: vi.fn(options.sourcify),
    etherscan: vi.fn(options.etherscan ?? (async () => found("FromEtherscan"))),
    getEtherscanApiKey: vi.fn(async () => options.apiKey ?? ""),
  };
  return {
    sources,
    fetch: () => fetchFromAbiSources(sources, 1, ADDRESS),
  };
};

describe("fetchFromAbiSources", () => {
  it("takes a verified ABI from Sourcify without asking Etherscan", async () => {
    const { sources, fetch } = setup({
      sourcify: async () => found("WETH9"),
      apiKey: "KEY",
    });

    expect(await fetch()).toEqual({
      kind: "found",
      name: "WETH9",
      abi: ABI,
      source: "sourcify",
    });
    expect(sources.etherscan).not.toHaveBeenCalled();
  });

  it("asks Etherscan with the key after a Sourcify miss", async () => {
    const { sources, fetch } = setup({
      sourcify: async () => NOT_FOUND,
      apiKey: " KEY ",
    });

    expect(await fetch()).toEqual({
      kind: "found",
      name: "FromEtherscan",
      abi: ABI,
      source: "etherscan",
    });
    expect(sources.etherscan).toHaveBeenCalledWith(1, ADDRESS, "KEY");
  });

  it("does not ask Etherscan without a key", async () => {
    const { sources, fetch } = setup({ sourcify: async () => NOT_FOUND });

    expect(await fetch()).toEqual(
      missed({ kind: "not-found" }, { kind: "not-asked" }),
    );
    expect(sources.etherscan).not.toHaveBeenCalled();
  });

  it.each([
    ["an HTTP 5xx", "HTTP 503"],
    ["a network error", "Failed to fetch"],
    ["a timeout", "Sourcify did not answer in 10 s"],
  ])(
    "asks Etherscan with the key when Sourcify fails with %s",
    async (_, reason) => {
      const { sources, fetch } = setup({
        sourcify: async () => {
          throw new Error(reason);
        },
        apiKey: "KEY",
      });

      expect(await fetch()).toEqual({
        kind: "found",
        name: "FromEtherscan",
        abi: ABI,
        source: "etherscan",
      });
      expect(sources.etherscan).toHaveBeenCalledWith(1, ADDRESS, "KEY");
    },
  );

  it("does not ask Etherscan without a key when Sourcify fails", async () => {
    const { sources, fetch } = setup({
      sourcify: async () => {
        throw new Error("HTTP 500");
      },
    });

    expect(await fetch()).toEqual(
      missed(sourcifyFailed("HTTP 500"), { kind: "not-asked" }),
    );
    expect(sources.etherscan).not.toHaveBeenCalled();
  });

  // What Etherscan answers, and the outcome kept for it
  const ETHERSCAN_MISSES: [
    string,
    () => Promise<EtherscanResult>,
    EtherscanOutcome,
  ][] = [
    ["has no verified ABI", async () => NOT_FOUND, { kind: "not-found" }],
    [
      "does not serve the Chain",
      async () => ({ kind: "unsupported-chain" }),
      { kind: "unsupported-chain" },
    ],
    [
      "needs a paid plan",
      async () => ({ kind: "paid-plan", chainId: 8453 }),
      { kind: "paid-plan", chainId: 8453 },
    ],
    [
      "says the key is invalid",
      async () => ({ kind: "invalid-key" }),
      { kind: "invalid-key" },
    ],
    [
      "is rate limited",
      async () => ({ kind: "rate-limit" }),
      { kind: "rate-limit" },
    ],
    [
      "fails",
      async () => {
        throw new Error("Query Timeout occured");
      },
      { kind: "failed", reason: "Query Timeout occured" },
    ],
  ];

  it.each(ETHERSCAN_MISSES)(
    "keeps Etherscan's outcome after a Sourcify miss when Etherscan %s",
    async (_, etherscan, outcome) => {
      const { fetch } = setup({
        sourcify: async () => NOT_FOUND,
        etherscan,
        apiKey: "KEY",
      });

      expect(await fetch()).toEqual(missed({ kind: "not-found" }, outcome));
    },
  );

  it.each(ETHERSCAN_MISSES)(
    "keeps both outcomes when Sourcify fails and Etherscan %s",
    async (_, etherscan, outcome) => {
      const { fetch } = setup({
        sourcify: async () => {
          throw new Error("HTTP 500");
        },
        etherscan,
        apiKey: "KEY",
      });

      expect(await fetch()).toEqual(
        missed(sourcifyFailed("HTTP 500"), outcome),
      );
    },
  );
});

const PROXY = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const IMPLEMENTATION = "0x43506849d7c04f9138d1a2050bbf3a0c054402dd";
const PROXY_ABI = [
  {
    type: "function",
    name: "upgradeTo",
    stateMutability: "nonpayable",
    inputs: [{ name: "newImplementation", type: "address" }],
    outputs: [],
  },
] as const satisfies Abi;

const proxyFound = (
  name: string,
  implementation?: `0x${string}` | null,
): AbiSourceResult => ({
  kind: "found",
  name,
  abi: PROXY_ABI,
  ...(implementation !== undefined && { implementation }),
});

// Each ABI Source answers by address; an address it does not list is a miss
const setupProxy = (options: {
  sourcify: Record<string, AbiSourceResult>;
  etherscan?: Record<string, EtherscanResult>;
  apiKey?: string;
  readImplementation?: () => Promise<`0x${string}` | undefined>;
}) => {
  const sources = {
    sourcify: vi.fn(
      async (_chainId: number, address: `0x${string}`) =>
        options.sourcify[address] ?? NOT_FOUND,
    ),
    etherscan: vi.fn(
      async (
        _chainId: number,
        address: `0x${string}`,
      ): Promise<EtherscanResult> => options.etherscan?.[address] ?? NOT_FOUND,
    ),
    getEtherscanApiKey: vi.fn(async () => options.apiKey ?? ""),
    readImplementation: vi.fn(
      options.readImplementation ?? (async () => undefined),
    ),
  };
  return {
    sources,
    fetch: (address: `0x${string}` = PROXY) =>
      fetchContractAbi(sources, 1, address),
  };
};

describe("fetchContractAbi", () => {
  it("takes the implementation's ABI and name for a proxy Sourcify resolves", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: {
        [PROXY]: proxyFound("FiatTokenProxy", IMPLEMENTATION),
        [IMPLEMENTATION]: found("FiatTokenV2_2"),
      },
    });

    expect(await fetch()).toEqual({
      kind: "found",
      name: "FiatTokenV2_2",
      abi: ABI,
      source: "sourcify",
      proxy: { implementation: IMPLEMENTATION, abi: "implementation" },
    });
    expect(sources.sourcify).toHaveBeenLastCalledWith(1, IMPLEMENTATION);
    expect(sources.readImplementation).not.toHaveBeenCalled();
  });

  it("takes the implementation's ABI for a proxy Etherscan resolves, in the same Source order", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: {},
      etherscan: {
        [PROXY]: proxyFound("FiatTokenProxy", IMPLEMENTATION),
        [IMPLEMENTATION]: found("FiatTokenV2_2"),
      },
      apiKey: "KEY",
    });

    expect(await fetch()).toEqual({
      kind: "found",
      name: "FiatTokenV2_2",
      abi: ABI,
      source: "etherscan",
      proxy: { implementation: IMPLEMENTATION, abi: "implementation" },
    });
    expect(sources.sourcify).toHaveBeenLastCalledWith(1, IMPLEMENTATION);
    expect(sources.etherscan).toHaveBeenLastCalledWith(
      1,
      IMPLEMENTATION,
      "KEY",
    );
  });

  it("resolves a proxy Etherscan has while Sourcify is down", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: {},
      etherscan: {
        [PROXY]: proxyFound("FiatTokenProxy", IMPLEMENTATION),
        [IMPLEMENTATION]: found("FiatTokenV2_2"),
      },
      apiKey: "KEY",
    });
    sources.sourcify.mockRejectedValue(new Error("HTTP 503"));

    expect(await fetch()).toEqual({
      kind: "found",
      name: "FiatTokenV2_2",
      abi: ABI,
      source: "etherscan",
      proxy: { implementation: IMPLEMENTATION, abi: "implementation" },
    });
  });

  it("fails with Sourcify's error when it is down and Etherscan has the proxy but not its implementation", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: {},
      etherscan: { [PROXY]: proxyFound("FiatTokenProxy", IMPLEMENTATION) },
      apiKey: "KEY",
    });
    sources.sourcify.mockRejectedValue(new Error("HTTP 503"));

    expect(await fetch()).toEqual(
      missed(sourcifyFailed("HTTP 503"), { kind: "not-found" }),
    );
  });

  it("reads the EIP-1967 slots when the ABI Source says nothing about a proxy", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: {
        [PROXY]: proxyFound("ERC1967Proxy"),
        [IMPLEMENTATION]: found("Token"),
      },
      readImplementation: async () => IMPLEMENTATION,
    });

    expect(await fetch()).toEqual({
      kind: "found",
      name: "Token",
      abi: ABI,
      source: "sourcify",
      proxy: { implementation: IMPLEMENTATION, abi: "implementation" },
    });
    expect(sources.readImplementation).toHaveBeenCalledWith(PROXY);
  });

  it("does not read the slots when the ABI Source names no implementation to follow", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: { [PROXY]: proxyFound("Diamond", null) },
      readImplementation: async () => IMPLEMENTATION,
    });

    expect(await fetch()).toEqual({
      kind: "found",
      name: "Diamond",
      abi: PROXY_ABI,
      source: "sourcify",
    });
    expect(sources.readImplementation).not.toHaveBeenCalled();
  });

  it("reads the EIP-1967 slots of an address no ABI Source has verified", async () => {
    const { fetch } = setupProxy({
      sourcify: { [IMPLEMENTATION]: found("Token") },
      readImplementation: async () => IMPLEMENTATION,
    });

    expect(await fetch()).toMatchObject({
      kind: "found",
      name: "Token",
      proxy: { implementation: IMPLEMENTATION, abi: "implementation" },
    });
  });

  it("falls back to the proxy's own ABI when the implementation has no verified ABI", async () => {
    const { fetch } = setupProxy({
      sourcify: { [PROXY]: proxyFound("FiatTokenProxy", IMPLEMENTATION) },
    });

    expect(await fetch()).toEqual({
      kind: "found",
      name: "FiatTokenProxy",
      abi: PROXY_ABI,
      source: "sourcify",
      proxy: { implementation: IMPLEMENTATION, abi: "proxy" },
    });
  });

  it("is a miss when neither the proxy nor its implementation is verified", async () => {
    const { fetch } = setupProxy({
      sourcify: {},
      readImplementation: async () => IMPLEMENTATION,
    });

    expect(await fetch()).toEqual(
      missed({ kind: "not-found" }, { kind: "not-asked" }),
    );
  });

  it("is a miss with the implementation's outcomes when neither is verified", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: {},
      apiKey: "KEY",
      readImplementation: async () => IMPLEMENTATION,
    });
    sources.etherscan.mockImplementation(async (_chainId, address) =>
      address === IMPLEMENTATION ? { kind: "rate-limit" } : NOT_FOUND,
    );

    expect(await fetch()).toEqual(
      missed({ kind: "not-found" }, { kind: "rate-limit" }),
    );
  });

  it("does not read the slots after a failure to fetch the address's own ABI", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: {},
      readImplementation: async () => IMPLEMENTATION,
    });
    sources.sourcify.mockRejectedValue(new Error("HTTP 503"));

    expect(await fetch()).toEqual(
      missed(sourcifyFailed("HTTP 503"), { kind: "not-asked" }),
    );
    expect(sources.readImplementation).not.toHaveBeenCalled();
  });

  it("keeps an address that is no proxy as it is", async () => {
    const { fetch } = setupProxy({ sourcify: { [ADDRESS]: found("WETH9") } });

    expect(await fetch(ADDRESS)).toEqual({
      kind: "found",
      name: "WETH9",
      abi: ABI,
      source: "sourcify",
    });
  });

  it("takes the address's own ABI when the Endpoint cannot be read", async () => {
    const { fetch } = setupProxy({
      sourcify: { [ADDRESS]: found("WETH9") },
      readImplementation: async () => {
        throw new Error("method not found");
      },
    });

    expect(await fetch(ADDRESS)).toEqual({
      kind: "found",
      name: "WETH9",
      abi: ABI,
      source: "sourcify",
    });
  });

  it("fails when fetching the implementation's ABI fails", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: { [PROXY]: proxyFound("FiatTokenProxy", IMPLEMENTATION) },
    });
    sources.sourcify.mockImplementation(async (_chainId, address) => {
      if (address === IMPLEMENTATION) {
        throw new Error("HTTP 500");
      }
      return proxyFound("FiatTokenProxy", IMPLEMENTATION);
    });

    expect(await fetch()).toEqual(
      missed(sourcifyFailed("HTTP 500"), { kind: "not-asked" }),
    );
  });

  it("misses with the implementation's outcomes when Etherscan says the key is invalid for it", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: { [PROXY]: proxyFound("FiatTokenProxy", IMPLEMENTATION) },
      apiKey: "BADKEY",
    });
    sources.etherscan.mockResolvedValue({ kind: "invalid-key" });

    expect(await fetch()).toEqual(
      missed({ kind: "not-found" }, { kind: "invalid-key" }),
    );
  });

  it("falls back to the proxy's own ABI when Etherscan needs a paid plan for the implementation", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: { [PROXY]: proxyFound("FiatTokenProxy", IMPLEMENTATION) },
      apiKey: "KEY",
    });
    sources.etherscan.mockResolvedValue({ kind: "paid-plan", chainId: 1 });

    expect(await fetch()).toMatchObject({
      kind: "found",
      name: "FiatTokenProxy",
      proxy: { implementation: IMPLEMENTATION, abi: "proxy" },
    });
  });

  it("does not follow a proxy that names itself as its implementation", async () => {
    const { sources, fetch } = setupProxy({
      sourcify: { [PROXY]: proxyFound("Odd", PROXY) },
    });

    expect(await fetch()).toEqual({
      kind: "found",
      name: "Odd",
      abi: PROXY_ABI,
      source: "sourcify",
    });
    expect(sources.sourcify).toHaveBeenCalledTimes(1);
  });
});
