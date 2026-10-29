import { Abi } from "viem";
import { AbiSourceResult } from "./sourcify.ts";
import { EtherscanResult } from "./etherscan.ts";

import { AbiSourceName, ContractProxy } from "../dal/contract.ts";
import { errorMessage } from "../utils/text.ts";

export type { AbiSourceName };

// What Sourcify answered for an address it has no ABI for
export type SourcifyOutcome =
  { kind: "not-found" } | { kind: "failed"; reason: string };

// What Etherscan answered for an address it has no ABI for; not asked
// without a key
export type EtherscanOutcome =
  | Exclude<EtherscanResult, { kind: "found" }>
  | { kind: "not-asked" }
  | { kind: "failed"; reason: string };

// What each ABI Source answered when neither had the ABI
export interface AbiSourceOutcomes {
  sourcify: SourcifyOutcome;
  etherscan: EtherscanOutcome;
}

// Whether an ABI Source failed rather than said it has no ABI: a network or
// HTTP error, an invalid key, a rate limit. A Chain Etherscan does not serve,
// or not on the key's plan, is a miss
export const hasFailure = ({ sourcify, etherscan }: AbiSourceOutcomes) =>
  sourcify.kind === "failed" ||
  etherscan.kind === "failed" ||
  etherscan.kind === "invalid-key" ||
  etherscan.kind === "rate-limit";

// The outcome of asking the ABI Sources in turn. `implementation` is as the
// ABI Source that has the ABI says, see AbiSourceResult
export type FetchedAbi =
  | {
      kind: "found";
      name: string;
      abi: Abi;
      source: AbiSourceName;
      implementation?: `0x${string}` | null;
    }
  | { kind: "missed"; outcomes: AbiSourceOutcomes };

// The ABI to save for an address: for a proxy, the implementation's
export type ContractAbi =
  | {
      kind: "found";
      name: string;
      abi: Abi;
      source: AbiSourceName;
      proxy?: ContractProxy;
    }
  | { kind: "missed"; outcomes: AbiSourceOutcomes };

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
// fails and the user has entered a key. Without the ABI, keeps what each
// ABI Source answered; it throws nothing an ABI Source throws
export async function fetchFromAbiSources(
  sources: AbiSources,
  chainId: number,
  address: `0x${string}`,
): Promise<FetchedAbi> {
  let sourcify: SourcifyOutcome;
  try {
    const result = await sources.sourcify(chainId, address);
    if (result.kind === "found") {
      return { ...result, source: "sourcify" };
    }
    sourcify = result;
  } catch (error) {
    sourcify = { kind: "failed", reason: errorMessage(error) };
  }

  const apiKey = (await sources.getEtherscanApiKey()).trim();
  if (!apiKey) {
    return {
      kind: "missed",
      outcomes: { sourcify, etherscan: { kind: "not-asked" } },
    };
  }
  let etherscan: EtherscanOutcome;
  try {
    const result = await sources.etherscan(chainId, address, apiKey);
    if (result.kind === "found") {
      return { ...result, source: "etherscan" };
    }
    etherscan = result;
  } catch (error) {
    etherscan = { kind: "failed", reason: errorMessage(error) };
  }
  return { kind: "missed", outcomes: { sourcify, etherscan } };
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
// counts as no proxy. A failure to fetch the address's own ABI ends the
// fetch; a failure to fetch the implementation's ABI, or Etherscan needing
// a paid plan for it, is the outcome, so no proxy's own ABI gets saved for
// good. Without either ABI, the miss is the
// implementation's, whose ABI would be saved.
export async function fetchContractAbi(
  sources: ContractAbiSources,
  chainId: number,
  address: `0x${string}`,
): Promise<ContractAbi> {
  const fetched = await fetchFromAbiSources(sources, chainId, address);
  if (fetched.kind === "missed" && hasFailure(fetched.outcomes)) {
    return fetched;
  }
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
  // An implementation Etherscan has on a paid plan: a key on one would find
  // it, so the proxy's own ABI, nearly useless, is not saved in its place
  const implementationOutcomes = fetchedImplementation.outcomes;
  if (
    own.kind === "found" &&
    !hasFailure(implementationOutcomes) &&
    implementationOutcomes.etherscan.kind !== "paid-plan"
  ) {
    return { ...own, proxy: { implementation, abi: "proxy" } };
  }
  return fetchedImplementation;
}
