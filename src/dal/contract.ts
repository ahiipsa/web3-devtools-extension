import { Abi } from "viem";

export interface Contract {
  address: `0x${string}`;
  name: string;
  abi: Abi;
  // The ABI Source it was fetched from; none once the user saves it
  source?: "sourcify";
}

type ContractStore = Record<string, Contract>;

// Contracts are identified by address alone: case-insensitive, chain-independent
export const normalizeAddress = (address: `0x${string}`) =>
  address.toLowerCase() as `0x${string}`;

// Contracts saved before the ABI moved into the Contract have no `abi` and
// would crash decoding, so they are dropped
const isContract = (value: unknown): value is Contract =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as Contract).abi);

// Keyed by normalized address
export const getContracts = async (): Promise<ContractStore> => {
  const { contracts } = await chrome.storage.local.get({ contracts: {} });
  return Object.fromEntries(
    Object.entries(contracts ?? {}).filter(([, contract]) =>
      isContract(contract),
    ),
  ) as ContractStore;
};

// Throws an Error whose message is fit to show the user
export function parseAbiJson(json: string): Abi {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("ABI is not valid JSON");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("ABI must be a JSON array");
  }

  if (parsed.length === 0) {
    throw new Error("ABI has no entries");
  }

  parsed.forEach((entry, index) => {
    if (typeof entry?.type !== "string") {
      throw new Error(`ABI entry ${index} has no type`);
    }
  });

  return parsed as Abi;
}

export async function saveContract(contract: Contract): Promise<Contract> {
  const saved = { ...contract, address: normalizeAddress(contract.address) };
  const contracts = await getContracts();

  contracts[saved.address] = saved;
  await chrome.storage.local.set({ contracts });

  return saved;
}

// Saves a Contract fetched from an ABI Source unless the address already has
// one; resolves to whether it was saved
export async function saveFetchedContract(
  contract: Contract & { source: "sourcify" },
): Promise<boolean> {
  const saved = { ...contract, address: normalizeAddress(contract.address) };
  const contracts = await getContracts();
  if (contracts[saved.address]) {
    return false;
  }

  contracts[saved.address] = saved;
  await chrome.storage.local.set({ contracts });
  return true;
}

export async function getContract(
  address: `0x${string}`,
): Promise<Contract | null> {
  const contracts = await getContracts();
  return contracts[normalizeAddress(address)] ?? null;
}

export async function deleteContract(address: `0x${string}`): Promise<void> {
  const contracts = await getContracts();

  delete contracts[normalizeAddress(address)];
  await chrome.storage.local.set({ contracts });
}
