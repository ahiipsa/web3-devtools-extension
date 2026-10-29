import { BatchPosition, RpcRequestStatus } from "../types/main.ts";
import { Decoding } from "../decoding/decodeRpcRequest.ts";
import { InnerCall } from "../decoding/multicall.ts";
import { formatInlineValues } from "../decoding/formatDecodedValue.ts";
import { count, formatReturnValues } from "../decoding/formatInnerCall.ts";
import { getFunctionSelector } from "../decoding/selector.ts";
import { Revert } from "../decoding/decodeRevert.ts";
import { formatRevert, formatRevertSource } from "../decoding/formatRevert.ts";
import { formatRpcRequestStatus } from "../capture/getRpcRequestStatus.ts";
import { RpcRequestChain } from "../chains/endpointChains.ts";
import { getChainName } from "../chains/chainNames.ts";
import { formatShortAddress } from "./formatAddress.ts";
import {
  formatChainMethodResultInline,
  getNamedParams,
  isScalarChainMethod,
} from "./chainMethods.ts";

// A piece of an Overview line and how it reads
export interface OverviewSegment {
  text: string;
  tone?: "muted" | "failed";
  // Shown on hover
  title?: string;
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
  // A result that is not return data, shown after →: eth_estimateGas's gas
  result?: string;
}

// ✗ in red at the end of a call line that failed
const getFailedMark = (failed: boolean): OverviewSegment[] =>
  failed ? [{ text: " ✗", tone: "failed" }] : [];

// What an RPC Request to a contract called and how it ended, on one line in
// the Inner Call format
export function getCallLine(input: CallLineInput): OverviewSegment[] {
  const {
    data,
    decoding,
    innerCalls,
    hasContract,
    contractPending,
    failed,
    result,
  } = input;
  const selector = getFunctionSelector(data);
  if (!selector) {
    return [];
  }
  const failedMark = getFailedMark(failed);

  if (decoding?.status !== "decoded") {
    const note = contractPending
      ? ""
      : hasContract
        ? " · ABI does not match"
        : " · no ABI";
    return [
      { text: selector + note, tone: "muted" },
      ...(!failed && result ? [{ text: ` → ${result}` }] : []),
      ...failedMark,
    ];
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
  const returned = decoding.returnValues
    ? formatReturnValues(decoding.returnValues)
    : result;
  const arrow = !failed && returned ? ` → ${returned}` : "";
  return [{ text: toOneLine(call + arrow) }, ...failedMark];
}

export interface ChainMethodCallLineInput {
  method: string;
  params: unknown;
  // The result of an RPC Request that succeeded
  result: unknown;
  chainId: number | undefined;
  failed: boolean;
}

// A scalar Chain method's call line: the method with its params and the main
// value of its result, `eth_getBalance(0xd8dA…6045, latest) → 0.01 ETH`
export function getChainMethodCallLine(
  input: ChainMethodCallLineInput,
): OverviewSegment[] {
  const { method, params, result, chainId, failed } = input;
  if (!isScalarChainMethod(method)) {
    return [];
  }
  const args = (getNamedParams(method, params) ?? [])
    .map(({ inline }) => inline)
    .join(", ");
  const returned = !failed
    ? formatChainMethodResultInline(method, result, chainId)
    : undefined;
  return [
    {
      text: toOneLine(`${method}(${args})${returned ? ` → ${returned}` : ""}`),
    },
    ...getFailedMark(failed),
  ];
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

// The Status, with an RPC error's message and its decoded Revert, and which
// other Contract decoded it muted after it
export function formatOverviewStatus(
  status: RpcRequestStatus,
  revert?: Revert,
): OverviewSegment[] {
  const label = formatRpcRequestStatus(status);
  if (status.kind !== "error") {
    return [{ text: label }];
  }
  const text = `${label}: ${status.message}`;
  const decoded = revert && revert.kind !== "raw" && formatRevert(revert);
  if (!decoded) {
    return [{ text }];
  }
  const source = formatRevertSource(revert);
  return [
    // Most nodes already put an Error(string) in the message
    { text: status.message.includes(decoded) ? text : `${text} — ${decoded}` },
    ...(source
      ? [
          {
            text: ` ${source.text}`,
            tone: "muted" as const,
            ...(source.title && { title: source.title }),
          },
        ]
      : []),
  ];
}

export const formatBatchPosition = ({ index, size }: BatchPosition) =>
  `${index} of ${size}`;
