import { getAddress, isAddress } from "viem";

// Whole, in checksum case, as name–value fields show it
export const formatAddress = (address: string) =>
  isAddress(address, { strict: false }) ? getAddress(address) : address;

// Short, as lists show it; the whole address goes in its tooltip and copies
export const formatShortAddress = (address: string) => {
  const whole = formatAddress(address);
  return `${whole.slice(0, 6)}…${whole.slice(-4)}`;
};

// The name a Contract shows under. A fetched Contract without a name was once
// saved under its address cut as "0xa0b8...eb48"; that name shows as its short
// address. Any other name, the user's own or a built-in one, shows as it is
export const formatContractName = ({
  address,
  name,
}: {
  address?: string;
  name: string;
}) =>
  address &&
  name.toLowerCase() ===
    `${address.slice(0, 6)}...${address.slice(-4)}`.toLowerCase()
    ? formatShortAddress(address)
    : name;
