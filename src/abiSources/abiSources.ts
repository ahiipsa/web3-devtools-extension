import { Abi } from "viem";
import { AbiSourceResult } from "./sourcify.ts";
import { EtherscanResult } from "./etherscan.ts";

import { AbiSourceName, ContractProxy } from "../dal/contract.ts";

export type { AbiSourceName };

// The outcome of asking the ABI Sources in turn; a miss lists those asked.
// `implementation` is as the ABI Source that has the ABI says, see
// AbiSourceResult
export type FetchedAbi =
  | {
      kind: "found";
      name: string;
      abi: Abi;
      source: AbiSourceName;
      implementation?: `0x${string}` | null;
    }
  | { kind: "not-found"; sources: AbiSourceName[] };

// The ABI to save for an address: for a proxy, the implementation's
export type ContractAbi =
  | {
      kind: "found";
      name: string;
      abi: Abi;
      source: AbiSourceName;
      proxy?: ContractProxy;
    }
  | { kind: "not-found"; sources: AbiSourceName[] };

export interface AbiSources {
  sourcify: (
    chainId: number,
    address: `0x${string}`,
  ) => Promise<AbiSourceResult>;
  etherscan: (
    chainId: number,
    address: `0x${string}`,
    apiKey: string,
  ) => Promise<EtherscanResult>;
  // Read at every fetch, so a key entered later is used at once
  getEtherscanApiKey: () => Promise<string>;
}

// Asks Sourcify, then Etherscan only when Sourcify has no verified ABI or
// fails and the user has entered a key. A miss lists only the ABI Sources
// that answered for the address, not Etherscan on a Chain it does not serve.
// When Sourcify fails and Etherscan has no ABI to give, Sourcify's failure is
// thrown; Etherscan's own failure only after a Sourcify miss.
export async function fetchFromAbiSources(
  sources: AbiSources,
  chainId: number,
  address: `0x${string}`,
): Promise<FetchedAbi> {
  let sourcify: AbiSourceResult | { kind: "failed"; error: unknown };
  try {
    sourcify = await sources.sourcify(chainId, address);
  } catch (error) {
    sourcify = { kind: "failed", error };
  }
  if (sourcify.kind === "found") {
    return { ...sourcify, source: "sourcify" };
  }

  const apiKey = (await sources.getEtherscanApiKey()).trim();
  if (!apiKey) {
    if (sourcify.kind === "failed") {
      throw sourcify.error;
    }
    return { kind: "not-found", sources: ["sourcify"] };
  }
  if (sourcify.kind === "failed") {
    const { error } = sourcify;
    const etherscan = await sources
      .etherscan(chainId, address, apiKey)
      .catch(() => {
        throw error;
      });
    if (etherscan.kind === "found") {
      return { ...etherscan, source: "etherscan" };
    }
    throw error;
  }
  const etherscan = await sources.etherscan(chainId, address, apiKey);
  if (etherscan.kind === "found") {
    return { ...etherscan, source: "etherscan" };
  }
  return {
    kind: "not-found",
    sources:
      etherscan.kind === "unsupported-chain"
        ? ["sourcify"]
        : ["sourcify", "etherscan"],
  };
}

export interface ContractAbiSources extends AbiSources {
  // The EIP-1967 implementation of the address, read on the Endpoint
  readImplementation: (
    address: `0x${string}`,
  ) => Promise<`0x${string}` | undefined>;
}

// Fetches the ABI of the address and, when it is a proxy, its
// implementation's ABI from the same ABI Sources. The implementation is the
// one the ABI Source names; only when it says nothing about proxies, the
// one the EIP-1967 slots on the Endpoint hold. A failed read of the slots
// counts as no proxy. A failure to fetch the
// implementation's ABI is thrown, so no proxy's own ABI gets saved for good.
export async function fetchContractAbi(
  sources: ContractAbiSources,
  chainId: number,
  address: `0x${string}`,
): Promise<ContractAbi> {
  const fetched = await fetchFromAbiSources(sources, chainId, address);
  const own: ContractAbi =
    fetched.kind === "found"
      ? {
          kind: "found",
          name: fetched.name,
          abi: fetched.abi,
          source: fetched.source,
        }
      : fetched;

  const named = fetched.kind === "found" ? fetched.implementation : undefined;
  const implementation =
    named === undefined
      ? await sources.readImplementation(address).catch(() => undefined)
      : named;
  if (!implementation || implementation === address) {
    return own;
  }

  const fetchedImplementation = await fetchFromAbiSources(
    sources,
    chainId,
    implementation,
  );
  if (fetchedImplementation.kind === "found") {
    return {
      kind: "found",
      name: fetchedImplementation.name,
      abi: fetchedImplementation.abi,
      source: fetchedImplementation.source,
      proxy: { implementation, abi: "implementation" },
    };
  }
  if (own.kind === "found") {
    return { ...own, proxy: { implementation, abi: "proxy" } };
  }
  return {
    kind: "not-found",
    sources: [...new Set([...own.sources, ...fetchedImplementation.sources])],
  };
}
