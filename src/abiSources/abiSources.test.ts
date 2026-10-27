import { describe, expect, it, vi } from "vitest";
import { Abi } from "viem";
import { AbiSourceResult } from "./sourcify.ts";
import { fetchFromAbiSources } from "./abiSources.ts";

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
