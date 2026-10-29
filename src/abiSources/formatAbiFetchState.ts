import { AbiFetchState } from "./abiFetcher.ts";
import {
  AbiSourceName,
  AbiSourceOutcomes,
  EtherscanOutcome,
} from "./abiSources.ts";
import { OverviewSegment } from "../details/overview.ts";
import { getChainName } from "../chains/chainNames.ts";
import { formatShortAddress } from "../details/formatAddress.ts";

export const ABI_SOURCE_NAMES: Record<AbiSourceName, string> = {
  sourcify: "Sourcify",
  etherscan: "Etherscan",
};

// A failure part is failed, a miss part muted
export interface AbiFetchLabel {
  segments: OverviewSegment[];
  // Etherscan rejected the key, or one would help: a ⚙ beside opens the
  // settings at its field
  openSettings?: true;
}

const muted = (text: string): OverviewSegment => ({ text, tone: "muted" });
const failed = (text: string): OverviewSegment => ({ text, tone: "failed" });

// Nothing for an Etherscan that was not asked or does not serve the Chain
const formatEtherscanOutcome = (
  outcome: EtherscanOutcome,
): OverviewSegment | undefined => {
  switch (outcome.kind) {
    case "not-asked":
    case "unsupported-chain":
      return undefined;
    case "not-found":
      return muted("No verified ABI on Etherscan");
    case "paid-plan":
      // By name, as the Chain column shows it, else by id
      return muted(
        `Etherscan needs a paid plan for ${getChainName(outcome.chainId) ?? outcome.chainId}`,
      );
    case "invalid-key":
      return failed("Etherscan API key is invalid");
    case "rate-limit":
      return failed("Etherscan rate limit, try again in a moment");
    case "failed":
      return failed(`Etherscan: ${outcome.reason}`);
  }
};

// Each ABI Source's outcome side by side, Sourcify's first
const formatOutcomes = ({
  sourcify,
  etherscan,
}: AbiSourceOutcomes): OverviewSegment[] => {
  if (sourcify.kind === "not-found" && etherscan.kind === "not-found") {
    return [muted("No verified ABI on Sourcify or Etherscan")];
  }
  if (sourcify.kind === "failed" && etherscan.kind === "not-asked") {
    return [
      failed(`Sourcify is unavailable (${sourcify.reason})`),
      muted(" · "),
      muted("add an Etherscan API key to try Etherscan"),
    ];
  }
  const etherscanPart = formatEtherscanOutcome(etherscan);
  return [
    sourcify.kind === "failed"
      ? failed(`Sourcify: ${sourcify.reason}`)
      : muted("No verified ABI on Sourcify"),
    ...(etherscanPart ? [muted(" · "), etherscanPart] : []),
  ];
};

// Etherscan rejected the key or needs a paid one, or Sourcify is down and
// no key was entered
const offersSettings = ({ sourcify, etherscan }: AbiSourceOutcomes) =>
  etherscan.kind === "invalid-key" ||
  etherscan.kind === "paid-plan" ||
  (sourcify.kind === "failed" && etherscan.kind === "not-asked");

// What Params, an Inner Call and the Contract tab show for an address
// without a Contract; nothing while idle
export const formatAbiFetchState = (
  state: AbiFetchState,
): AbiFetchLabel | undefined => {
  switch (state.kind) {
    case "fetching":
      return { segments: [muted("Fetching ABI…")] };
    case "missed":
      // What the ABI Sources answered, not what they would answer now,
      // marked as the implementation's when they answered for a proxy's
      return {
        segments: [
          ...(state.implementation
            ? [
                {
                  ...muted("Implementation: "),
                  title: formatShortAddress(state.implementation),
                },
              ]
            : []),
          ...formatOutcomes(state.outcomes),
        ],
        ...(offersSettings(state.outcomes) && { openSettings: true }),
      };
    case "failed":
      return { segments: [failed(`Fetch failed: ${state.reason}`)] };
    case "idle":
      return undefined;
  }
};
