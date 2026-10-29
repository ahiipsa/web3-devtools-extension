import { Contract } from "../dal/contract.ts";
import { BuiltInContract } from "../decoding/multicall.ts";
import { AbiFetchState } from "../abiSources/abiFetcher.ts";
import {
  ABI_SOURCE_NAMES,
  AbiFetchLabel,
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

// What the form's buttons say for each kind. Removing a fetched Contract
// lasts only until the ABI is fetched again: once per Chain and address per
// Panel session while fetching is automatic, else by Fetch ABI
export interface ContractTabActions {
  save: string;
  remove?: {
    button: string;
    question: string;
    confirm: string;
    done: string;
    failed: string;
  };
}

export const getContractTabActions = (
  kind: ContractTabKind,
  fetchAbisAutomatically: boolean,
): ContractTabActions => {
  switch (kind) {
    case "own":
      return {
        save: "Save",
        remove: {
          button: "Delete",
          question:
            "Delete this Contract? Its RPC Requests will no longer be decoded.",
          confirm: "Yes, delete",
          done: "Contract deleted",
          failed: "Failed to delete Contract",
        },
      };
    case "fetched":
      return {
        save: "Save as mine",
        remove: {
          button: "Forget fetched ABI",
          question: fetchAbisAutomatically
            ? "Forget the fetched ABI? It is fetched again the next time DevTools opens."
            : "Forget the fetched ABI? Fetch ABI fetches it again.",
          confirm: "Forget",
          done: "Fetched ABI forgotten",
          failed: "Failed to forget the fetched ABI",
        },
      };
    case "built-in":
      return { save: "Save as mine" };
    case "none":
      return { save: "Save" };
  }
};

// The row above the form: where the ABI comes from, and its action
export interface ContractTabHeader {
  segments: OverviewSegment[];
  // Shown whole after the segments, with copy and ↗
  implementation?: `0x${string}`;
  // Fetch ABI on the right, for an address without a Contract
  fetchAbi?: "enabled" | "disabled";
  // A ⚙ after the segments that opens the settings at the Etherscan API key
  openSettings?: true;
}

const formatFetchState = (
  state: AbiFetchState,
  hasEtherscanKey: boolean,
): AbiFetchLabel | undefined => {
  if (state.kind === "fetching") {
    // The ABI Sources that may be asked: Etherscan only after Sourcify
    return {
      segments: [
        {
          text: `Fetching ABI from ${hasEtherscanKey ? "Sourcify or Etherscan" : "Sourcify"}…`,
        },
      ],
    };
  }
  return formatAbiFetchState(state);
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
  const label = formatFetchState(fetchState, hasEtherscanKey);
  const openSettings = label?.openSettings;
  if (builtIn) {
    // An address without a Contract is still fetched for; its state follows
    return {
      segments: [
        { text: `Built-in ${builtIn.name} ABI` },
        ...(label ? [{ text: " · " }, ...label.segments] : []),
      ],
      fetchAbi,
      ...(openSettings && { openSettings }),
    };
  }
  return {
    segments: label?.segments ?? [{ text: "No ABI for this address" }],
    fetchAbi,
    ...(openSettings && { openSettings }),
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
