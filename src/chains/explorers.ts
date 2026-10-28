// The main Explorer of each Chain in chainNames.ts: the Etherscan family where
// the Chain has one, else Blockscout. Local Chains (31337, 1337) have none
const EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  17000: "https://holesky.etherscan.io",
  560048: "https://hoodi.etherscan.io",
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
  42161: "https://arbiscan.io",
  42170: "https://nova.arbiscan.io",
  421614: "https://sepolia.arbiscan.io",
  10: "https://optimistic.etherscan.io",
  11155420: "https://sepolia-optimism.etherscan.io",
  137: "https://polygonscan.com",
  80002: "https://amoy.polygonscan.com",
  1101: "https://zkevm.polygonscan.com",
  56: "https://bscscan.com",
  97: "https://testnet.bscscan.com",
  43114: "https://snowscan.xyz",
  43113: "https://testnet.snowscan.xyz",
  100: "https://gnosisscan.io",
  10200: "https://gnosis-chiado.blockscout.com",
  59144: "https://lineascan.build",
  59141: "https://sepolia.lineascan.build",
  534352: "https://scrollscan.com",
  534351: "https://sepolia.scrollscan.com",
  324: "https://era.zksync.network",
  300: "https://sepolia-era.zksync.network",
  5000: "https://mantlescan.xyz",
  5003: "https://sepolia.mantlescan.xyz",
  81457: "https://blastscan.io",
  168587773: "https://sepolia.blastscan.io",
  42220: "https://celoscan.io",
  44787: "https://alfajores.celoscan.io",
  11142220: "https://celo-sepolia.blockscout.com",
  130: "https://uniscan.xyz",
  1301: "https://sepolia.uniscan.xyz",
  7777777: "https://explorer.zora.energy",
  480: "https://worldscan.org",
  34443: "https://explorer.mode.network",
  252: "https://fraxscan.com",
  80094: "https://berascan.com",
  146: "https://sonicscan.org",
  250: "https://ftmscan.com",
  25: "https://cronoscan.com",
  1284: "https://moonscan.io",
};

// What an Explorer can look up; a block number in decimal or 0x hex
export type ExplorerTarget =
  | { kind: "address"; value: string }
  | { kind: "transaction"; value: string }
  | { kind: "block"; value: string };

const toDecimal = (blockNumber: string) => {
  try {
    const number = BigInt(blockNumber);
    return number >= 0n ? number.toString() : undefined;
  } catch {
    return undefined;
  }
};

const getPath = (target: ExplorerTarget) => {
  switch (target.kind) {
    case "address":
      return `address/${target.value}`;
    case "transaction":
      return `tx/${target.value}`;
    case "block": {
      const number = toDecimal(target.value);
      return number === undefined ? undefined : `block/${number}`;
    }
  }
};

// The page for the target on the Explorer of the Chain; none without a Chain
// or for a Chain without a known Explorer
export function getExplorerUrl(
  chainId: number | undefined,
  target: ExplorerTarget,
): string | undefined {
  const base = chainId === undefined ? undefined : EXPLORERS[chainId];
  const path = getPath(target);
  return base && path ? `${base}/${path}` : undefined;
}
