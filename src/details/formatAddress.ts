import { getAddress, isAddress } from "viem";

// Whole, in checksum case, as name–value fields show it
export const formatAddress = (address: string) =>
  isAddress(address, { strict: false }) ? getAddress(address) : address;

// Short, as lists show it; the whole address goes in its tooltip and copies
export const formatShortAddress = (address: string) => {
  const whole = formatAddress(address);
  return `${whole.slice(0, 6)}…${whole.slice(-4)}`;
};
