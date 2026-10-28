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

export const formatRpcError = ({
  code,
  message,
}: Pick<NonNullable<RpcResponseBody["error"]>, "code" | "message">) =>
  `RPC error ${code} · ${message}`;
