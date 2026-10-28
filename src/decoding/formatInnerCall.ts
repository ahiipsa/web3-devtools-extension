import { InnerCall, ResultCountMismatch } from "./multicall.ts";
import { DecodedValue } from "./decodeRpcRequest.ts";
import { formatDecodedValue } from "./formatDecodedValue.ts";

// Positional labels (`[0]`) add nothing inline
const formatValues = (values: DecodedValue[]) =>
  values
    .map(({ name, value }) =>
      name && !name.startsWith("[")
        ? `${name}: ${formatDecodedValue(value)}`
        : formatDecodedValue(value),
    )
    .join(", ");

// The function with its arguments, else the Selector
export const formatInnerCallFunction = ({ callData, decoding }: InnerCall) =>
  decoding?.status === "decoded"
    ? `${decoding.functionName}(${formatValues(decoding.args)})`
    : callData.slice(0, 10).toLowerCase();

// The decoded return data: a lone value bare, several in parentheses
export const formatInnerCallResult = ({ decoding }: InnerCall) => {
  const values =
    decoding?.status === "decoded" ? decoding.returnValues : undefined;
  if (!values) {
    return undefined;
  }
  return values.length === 1
    ? formatDecodedValue(values[0].value)
    : `(${formatValues(values)})`;
};

// The raw return data when nothing decodes it; nothing for a failed Inner
// Call, whose return data is its revert
export const formatInnerCallRawResult = (innerCall: InnerCall) =>
  innerCall.success === false || formatInnerCallResult(innerCall) !== undefined
    ? undefined
    : innerCall.returnData;

// Solidity's Panic codes
const PANIC_REASONS: Record<number, string> = {
  0x00: "generic",
  0x01: "assertion failed",
  0x11: "arithmetic overflow",
  0x12: "division by zero",
  0x21: "invalid enum value",
  0x22: "invalid storage byte array",
  0x31: "pop on empty array",
  0x32: "array index out of bounds",
  0x41: "out of memory",
  0x51: "uninitialized function",
};

// Why a failed Inner Call reverted
export const formatInnerCallRevert = ({ revert }: InnerCall) => {
  switch (revert?.kind) {
    case "error":
      return revert.message;
    case "panic": {
      const reason = PANIC_REASONS[Number(revert.code)];
      const code = `Panic 0x${revert.code.toString(16).padStart(2, "0")}`;
      return reason ? `${code} (${reason})` : code;
    }
    case "custom":
      return `${revert.name}(${formatValues(revert.args)})`;
    case "raw":
      return revert.data;
    default:
      return undefined;
  }
};

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export const formatResultCountMismatch = ({
  resultCount,
  innerCallCount,
}: ResultCountMismatch) =>
  `The RPC Response has ${count(resultCount, "result")} for ${count(innerCallCount, "Inner Call")}`;
