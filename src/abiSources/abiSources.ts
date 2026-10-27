import { Abi } from "viem";
import { AbiSourceResult } from "./sourcify.ts";

import { AbiSourceName } from "../dal/contract.ts";

export type { AbiSourceName };

// The outcome of asking the ABI Sources in turn; a miss lists those asked
export type FetchedAbi =
  | { kind: "found"; name: string; abi: Abi; source: AbiSourceName }
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
