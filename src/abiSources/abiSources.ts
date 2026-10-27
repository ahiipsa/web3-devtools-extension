import { Abi } from "viem";
import { AbiSourceResult } from "./sourcify.ts";

import { AbiSourceName, ContractProxy } from "../dal/contract.ts";

export type { AbiSourceName };

// The outcome of asking the ABI Sources in turn; a miss lists those asked.
// `implementation` is set when the ABI Source marks the address as a proxy
export type FetchedAbi =
  | {
      kind: "found";
      name: string;
      abi: Abi;
      source: AbiSourceName;
      implementation?: `0x${string}`;
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
  ) => Promise<AbiSourceResult>;
  // Read at every fetch, so a key entered later is used at once
  getEtherscanApiKey: () => Promise<string>;
}

// Asks Sourcify, then Etherscan only when Sourcify has no verified ABI and the
// user has entered a key. A failure of either is thrown as is.
export async function fetchFromAbiSources(
  sources: AbiSources,
  chainId: number,
  address: `0x${string}`,
): Promise<FetchedAbi> {
  const sourcify = await sources.sourcify(chainId, address);
  if (sourcify.kind === "found") {
    return { ...sourcify, source: "sourcify" };
  }

  const apiKey = (await sources.getEtherscanApiKey()).trim();
  if (!apiKey) {
    return { kind: "not-found", sources: ["sourcify"] };
  }
  const etherscan = await sources.etherscan(chainId, address, apiKey);
  if (etherscan.kind === "found") {
    return { ...etherscan, source: "etherscan" };
  }
  return { kind: "not-found", sources: ["sourcify", "etherscan"] };
}

export interface ContractAbiSources extends AbiSources {
  // The EIP-1967 implementation of the address, read on the Endpoint
  readImplementation: (
    address: `0x${string}`,
  ) => Promise<`0x${string}` | undefined>;
}

// Fetches the ABI of the address and, when it is a proxy, its
// implementation's ABI from the same ABI Sources. The proxy is the one the
// ABI Source names, else the EIP-1967 slots on the Endpoint say; a failed
// read of the slots counts as no proxy. A failure to fetch the
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

  const implementation =
    (fetched.kind === "found" ? fetched.implementation : undefined) ??
    (await sources.readImplementation(address).catch(() => undefined));
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
