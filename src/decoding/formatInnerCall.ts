import { count } from "../utils/text.ts";
import { InnerCall, ResultCountMismatch } from "./multicall.ts";
import {
  formatDecodedValue,
  formatInlineValues,
} from "./formatDecodedValue.ts";
import {
  formatRevert,
  formatRevertSource,
  RevertSource,
} from "./formatRevert.ts";
import { DecodedValue } from "./decodeRpcRequest.ts";

// The function's name, else the Selector
export const formatInnerCallFunctionName = ({
  callData,
  decoding,
}: InnerCall) =>
  decoding?.status === "decoded"
    ? decoding.functionName
    : callData.slice(0, 10).toLowerCase();

// The function with its arguments, else the Selector
export const formatInnerCallFunction = (innerCall: InnerCall) => {
  const name = formatInnerCallFunctionName(innerCall);
  const { decoding } = innerCall;
  return decoding?.status === "decoded"
    ? `${name}(${formatInlineValues(decoding.args)})`
    : name;
};

// Return values on one line: a lone value bare, several in parentheses
export const formatReturnValues = (values: DecodedValue[]) =>
  values.length === 1
    ? formatDecodedValue(values[0].value)
    : `(${formatInlineValues(values)})`;

// The decoded return data
export const formatInnerCallResult = ({ decoding }: InnerCall) => {
  const values =
    decoding?.status === "decoded" ? decoding.returnValues : undefined;
  return values && formatReturnValues(values);
};

// What an Inner Call returned, from the RPC Response
export type InnerCallOutcome =
  // The decoded result, else the raw return data
  | { kind: "succeeded"; value: string; decoded: boolean }
  // Its Revert, none for empty revert data, and the other Contract whose ABI
  // decoded it
  | { kind: "failed"; revert?: string; revertSource?: RevertSource }
  // No result paired with it
  | { kind: "none" };

export const getInnerCallOutcome = (innerCall: InnerCall): InnerCallOutcome => {
  const { returnData, success, revert } = innerCall;
  if (returnData === undefined) {
    return { kind: "none" };
  }
  if (success === false) {
    const revertSource = revert && formatRevertSource(revert);
    return {
      kind: "failed",
      revert: revert && formatRevert(revert),
      ...(revertSource && { revertSource }),
    };
  }
  const result = formatInnerCallResult(innerCall);
  return result === undefined
    ? { kind: "succeeded", value: returnData, decoded: false }
    : { kind: "succeeded", value: result, decoded: true };
};

export { count };

export const formatResultCountMismatch = ({
  resultCount,
  innerCallCount,
}: ResultCountMismatch) =>
  `The RPC Response has ${count(resultCount, "result")} for ${count(innerCallCount, "Inner Call")}`;
