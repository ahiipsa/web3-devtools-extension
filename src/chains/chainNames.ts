// Names of common Chains by chain id, built in rather than taken from
// viem/chains, which would add every Chain viem knows to the bundle
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  11155111: "Sepolia",
  17000: "Holesky",
  560048: "Hoodi",
  8453: "Base",
  84532: "Base Sepolia",
  42161: "Arbitrum One",
  42170: "Arbitrum Nova",
  421614: "Arbitrum Sepolia",
  10: "OP Mainnet",
  11155420: "OP Sepolia",
  137: "Polygon",
  80002: "Polygon Amoy",
  1101: "Polygon zkEVM",
  56: "BNB Smart Chain",
  97: "BNB Testnet",
  43114: "Avalanche",
  43113: "Avalanche Fuji",
  100: "Gnosis",
  10200: "Gnosis Chiado",
  59144: "Linea",
  59141: "Linea Sepolia",
  534352: "Scroll",
  534351: "Scroll Sepolia",
  324: "zkSync",
  300: "zkSync Sepolia",
  5000: "Mantle",
  5003: "Mantle Sepolia",
  81457: "Blast",
  168587773: "Blast Sepolia",
  42220: "Celo",
  44787: "Celo Alfajores",
  11142220: "Celo Sepolia",
  130: "Unichain",
  1301: "Unichain Sepolia",
  7777777: "Zora",
  480: "World Chain",
  34443: "Mode",
  252: "Fraxtal",
  80094: "Berachain",
  146: "Sonic",
  250: "Fantom",
  25: "Cronos",
  1284: "Moonbeam",
  // Hardhat and Anvil share 31337; Ganache and Geth's dev mode use 1337
  31337: "Localhost",
  1337: "Localhost",
};

export const getChainName = (chainId: number): string | undefined =>
  CHAIN_NAMES[chainId];

// Every Chain with a name: nativeCurrencies.ts and explorers.ts keep one
// entry for each
export const NAMED_CHAIN_IDS = Object.keys(CHAIN_NAMES).map(Number);
