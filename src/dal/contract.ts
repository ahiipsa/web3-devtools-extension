import { Abi } from "viem";

export interface Contract {
  address: `0x${string}`;
  name: string;
  abi: Abi;
}

type ContractStore = Record<string, Contract>;

// Contracts are identified by address alone: case-insensitive, chain-independent
export const normalizeAddress = (address: `0x${string}`) =>
  address.toLowerCase() as `0x${string}`;

const readContracts = async (): Promise<ContractStore> => {
  const { contracts } = await chrome.storage.local.get({ contracts: {} });
  return contracts;
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
  const contracts = await readContracts();

  contracts[saved.address] = saved;
  await chrome.storage.local.set({ contracts });

  return saved;
}

// Keyed by normalized address
export async function getContracts(): Promise<Record<string, Contract>> {
  return readContracts();
}

export async function getContract(
  address: `0x${string}`,
): Promise<Contract | null> {
  const contracts = await readContracts();
  return contracts[normalizeAddress(address)] ?? null;
}
