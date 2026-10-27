import { AbiFetchState } from "./abiFetcher.ts";
import { AbiSourceName } from "./abiSources.ts";

export const ABI_SOURCE_NAMES: Record<AbiSourceName, string> = {
  sourcify: "Sourcify",
  etherscan: "Etherscan",
};

// What the Contract tab and an Inner Call show for an address without a
// Contract; nothing while idle
export const formatAbiFetchState = (state: AbiFetchState) => {
  switch (state.kind) {
    case "fetching":
      return "Fetching ABI…";
    case "not-found":
      // The ABI Sources asked, not those that would be asked now
      return `No verified ABI on ${state.sources.map((source) => ABI_SOURCE_NAMES[source]).join(" or ")}`;
    case "failed":
      return `Fetch failed: ${state.reason}`;
    case "idle":
      return undefined;
  }
};
