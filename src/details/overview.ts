import { BatchPosition, RpcRequestStatus } from "../types/main.ts";
import { Decoding } from "../decoding/decodeRpcRequest.ts";
import { InnerCall } from "../decoding/multicall.ts";
import { formatInlineValues } from "../decoding/formatDecodedValue.ts";
import { count, formatReturnValues } from "../decoding/formatInnerCall.ts";
import { getFunctionSelector } from "../decoding/selector.ts";
import { Revert } from "../decoding/decodeRevert.ts";
import { formatRevert } from "../decoding/formatRevert.ts";
import { formatRpcRequestStatus } from "../capture/getRpcRequestStatus.ts";
import { RpcRequestChain } from "../chains/endpointChains.ts";
import { getChainName } from "../chains/chainNames.ts";
import { formatShortAddress } from "./formatAddress.ts";

// A piece of an Overview line and how it reads
export interface OverviewSegment {
  text: string;
  tone?: "muted" | "failed";
}

// On one line: a struct's JSON joined up and every address short, also
// inside structs and arrays; the Contract field holds the whole address
const toOneLine = (text: string) =>
  text
    .replace(/\s*\n\s*/g, " ")
    .replace(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g, formatShortAddress);

export interface CallLineInput {
  // The RPC Request's calldata; no call line without it
  data: `0x${string}` | undefined;
  decoding: Decoding | undefined;
  // Only for a Multicall
  innerCalls: InnerCall[] | undefined;
  // A Contract, or the built-in aggregator, decodes calls to the address
  hasContract: boolean;
  // The stored Contract is still being read
  contractPending: boolean;
  failed: boolean;
}

// What an RPC Request to a contract called and how it ended, on one line in
// the Inner Call format
export function getCallLine(input: CallLineInput): OverviewSegment[] {
  const { data, decoding, innerCalls, hasContract, contractPending, failed } =
    input;
  const selector = getFunctionSelector(data);
  if (!selector) {
    return [];
  }
  const failedMark: OverviewSegment[] = failed
    ? [{ text: " ✗", tone: "failed" }]
    : [];

  if (decoding?.status !== "decoded") {
    const note = contractPending
      ? ""
      : hasContract
        ? " · ABI does not match"
        : " · no ABI";
    return [{ text: selector + note, tone: "muted" }, ...failedMark];
  }

  if (innerCalls) {
    const failedCount = innerCalls.filter(
      ({ success }) => success === false,
    ).length;
    const failedInnerCalls: OverviewSegment[] = failedCount
      ? [{ text: ", " }, { text: `${failedCount} failed`, tone: "failed" }]
      : [];
    return [
      {
        text: `${decoding.functionName} · ${count(innerCalls.length, "Inner Call")}`,
      },
      ...failedInnerCalls,
      ...failedMark,
    ];
  }

  const call = `${decoding.functionName}(${formatInlineValues(decoding.args)})`;
  const result =
    !failed && decoding.returnValues
      ? ` → ${formatReturnValues(decoding.returnValues)}`
      : "";
  return [{ text: toOneLine(call + result) }, ...failedMark];
}

// The RPC Request's Chain: its name and chain id, or the chain id alone
export function formatOverviewChain(chain: RpcRequestChain): OverviewSegment {
  switch (chain.kind) {
    case "known": {
      const name = getChainName(chain.chainId);
      return { text: name ? `${name} · ${chain.chainId}` : `${chain.chainId}` };
    }
    case "looking-up":
      return { text: "looking up…", tone: "muted" };
    case "failed":
      return { text: `unknown: ${chain.reason}`, tone: "muted" };
  }
}

// The Status, with an RPC error's message and its decoded Revert
export function formatOverviewStatus(
  status: RpcRequestStatus,
  revert?: Revert,
): string {
  const label = formatRpcRequestStatus(status);
  if (status.kind !== "error") {
    return label;
  }
  const decoded = revert && revert.kind !== "raw" && formatRevert(revert);
  // Most nodes already put an Error(string) in the message
  const reason =
    decoded && !status.message.includes(decoded) ? ` — ${decoded}` : "";
  return `${label}: ${status.message}${reason}`;
}

export const formatBatchPosition = ({ index, size }: BatchPosition) =>
  `${index} of ${size}`;
