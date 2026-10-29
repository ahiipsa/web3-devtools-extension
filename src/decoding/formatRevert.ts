import { RpcResponseBody } from "../types/main.ts";
import { Revert } from "./decodeRevert.ts";
import { formatInlineValues } from "./formatDecodedValue.ts";

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

// A Revert on one line
export const formatRevert = (revert: Revert) => {
  switch (revert.kind) {
    case "error":
      return revert.message;
    case "panic": {
      const reason = PANIC_REASONS[Number(revert.code)];
      const code = `Panic 0x${revert.code.toString(16).padStart(2, "0")}`;
      return reason ? `${code} (${reason})` : code;
    }
    case "custom":
      return `${revert.name}(${formatInlineValues(revert.args)})`;
    case "raw":
      return revert.data;
  }
};

// Which other Contract's ABI decoded a bubbled-up custom error, shown muted
// after it, and a tooltip naming every Contract that declares it
export interface RevertSource {
  text: string;
  title?: string;
}

// None when the first ABI tried decoded the error; a count of the other
// Contracts that declare it too, as common errors are declared by many
export const formatRevertSource = (
  revert: Revert,
): RevertSource | undefined => {
  if (revert.kind !== "custom" || revert.from === undefined) {
    return undefined;
  }
  const { from, alsoFrom = [] } = revert;
  if (alsoFrom.length === 0) {
    return { text: `from ${from}` };
  }
  return {
    text: `from ${from} +${alsoFrom.length}`,
    title: `Declared by ${[from, ...alsoFrom].join(", ")}`,
  };
};

export const formatRpcError = ({
  code,
  message,
}: Pick<NonNullable<RpcResponseBody["error"]>, "code" | "message">) =>
  `RPC error ${code} · ${message}`;
