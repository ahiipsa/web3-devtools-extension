import { describe, expect, it, vi } from "vitest";
import { Abi } from "viem";
import { AbiSourceResult } from "./sourcify.ts";
import { fetchContractAbi, fetchFromAbiSources } from "./abiSources.ts";

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

const setup = (options: {
  sourcify: () => Promise<AbiSourceResult>;
  etherscan?: () => Promise<AbiSourceResult>;
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

    expect(await fetch()).toEqual({ kind: "not-found", sources: ["sourcify"] });
    expect(sources.etherscan).not.toHaveBeenCalled();
  });

  it("does not ask Etherscan when Sourcify fails", async () => {
    const { sources, fetch } = setup({
      sourcify: async () => {
        throw new Error("HTTP 500");
      },
      apiKey: "KEY",
    });

    await expect(fetch()).rejects.toThrow("HTTP 500");
    expect(sources.etherscan).not.toHaveBeenCalled();
  });

  it("is a miss on both when Etherscan has no verified ABI either", async () => {
    const { fetch } = setup({
      sourcify: async () => NOT_FOUND,
      etherscan: async () => NOT_FOUND,
      apiKey: "KEY",
    });

    expect(await fetch()).toEqual({
      kind: "not-found",
      sources: ["sourcify", "etherscan"],
    });
  });

  it("fails with Etherscan's error", async () => {
    const { fetch } = setup({
      sourcify: async () => NOT_FOUND,
      etherscan: async () => {
        throw new Error("Invalid API Key");
      },
      apiKey: "KEY",
    });

    await expect(fetch()).rejects.toThrow("Invalid API Key");
  });
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
  etherscan?: Record<string, AbiSourceResult>;
  apiKey?: string;
  readImplementation?: () => Promise<`0x${string}` | undefined>;
}) => {
  const sources = {
    sourcify: vi.fn(
      async (_chainId: number, address: `0x${string}`) =>
        options.sourcify[address] ?? NOT_FOUND,
    ),
    etherscan: vi.fn(
      async (_chainId: number, address: `0x${string}`) =>
        options.etherscan?.[address] ?? NOT_FOUND,
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

    expect(await fetch()).toEqual({ kind: "not-found", sources: ["sourcify"] });
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

    await expect(fetch()).rejects.toThrow("HTTP 500");
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
