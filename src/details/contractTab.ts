import { Contract } from "../dal/contract.ts";
import { BuiltInContract } from "../decoding/multicall.ts";
import { AbiFetchState } from "../abiSources/abiFetcher.ts";
import {
  ABI_SOURCE_NAMES,
  formatAbiFetchState,
} from "../abiSources/formatAbiFetchState.ts";
import { OverviewSegment } from "./overview.ts";
import { formatShortAddress } from "./formatAddress.ts";

// Whose ABI the Contract tab's form holds; it decides the buttons
export type ContractTabKind = "own" | "fetched" | "built-in" | "none";

export const getContractTabKind = (
  contract: Contract | null | undefined,
  builtIn: BuiltInContract | undefined,
): ContractTabKind => {
  if (contract) {
    return contract.source ? "fetched" : "own";
  }
  return builtIn ? "built-in" : "none";
};

// The row above the form: where the ABI comes from, and its action
export interface ContractTabHeader {
  segments: OverviewSegment[];
  // Shown whole after the segments, with copy and ↗
  implementation?: `0x${string}`;
  // Fetch ABI on the right, for an address without a Contract
  fetchAbi?: "enabled" | "disabled";
}

const formatFetchState = (
  state: AbiFetchState,
  hasEtherscanKey: boolean,
): OverviewSegment | undefined => {
  if (state.kind === "fetching") {
    // The ABI Sources that may be asked: Etherscan only after Sourcify
    return {
      text: `Fetching ABI from ${hasEtherscanKey ? "Sourcify or Etherscan" : "Sourcify"}…`,
    };
  }
  const label = formatAbiFetchState(state);
  if (!label) {
    return undefined;
  }
  return state.kind === "failed"
    ? { text: label, tone: "failed" }
    : { text: label };
};

export const getContractTabHeader = (input: {
  contract: Contract | null | undefined;
  builtIn: BuiltInContract | undefined;
  fetchState: AbiFetchState;
  hasEtherscanKey: boolean;
}): ContractTabHeader => {
  const { contract, builtIn, fetchState, hasEtherscanKey } = input;

  if (contract?.source) {
    const source = ABI_SOURCE_NAMES[contract.source];
    switch (contract.proxy?.abi) {
      case "implementation":
        return {
          segments: [{ text: `${source} · via proxy · implementation ` }],
          implementation: contract.proxy.implementation,
        };
      case "proxy":
        return {
          segments: [
            {
              text: `${source} · proxy's own ABI: its implementation has no verified ABI`,
            },
          ],
        };
      default:
        return { segments: [{ text: source }] };
    }
  }
  if (contract) {
    return { segments: [{ text: "Saved by you" }] };
  }

  const fetchAbi = fetchState.kind === "fetching" ? "disabled" : "enabled";
  const fetchSegment = formatFetchState(fetchState, hasEtherscanKey);
  if (builtIn) {
    // An address without a Contract is still fetched for; its state follows
    return {
      segments: [
        { text: `Built-in ${builtIn.name} ABI` },
        ...(fetchSegment ? [{ text: " · " }, fetchSegment] : []),
      ],
      fetchAbi,
    };
  }
  return {
    segments: [fetchSegment ?? { text: "No ABI for this address" }],
    fetchAbi,
  };
};

// Above the header when the Contract tab shows an Inner Call's target;
// `index` counts from 0
export const formatInnerCallTargetTitle = (
  index: number,
  multicallName: string,
  multicallAddress: `0x${string}`,
) =>
  `Inner Call #${index + 1} of ${multicallName} ${formatShortAddress(multicallAddress)}`;
