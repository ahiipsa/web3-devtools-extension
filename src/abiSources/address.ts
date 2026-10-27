import { isAddress } from "viem";

// A lowercase non-zero address, or undefined for anything else
export const parseNonZeroAddress = (
  value: unknown,
): `0x${string}` | undefined =>
  typeof value === "string" &&
  isAddress(value, { strict: false }) &&
  !/^0x0{40}$/.test(value)
    ? (value.toLowerCase() as `0x${string}`)
    : undefined;
