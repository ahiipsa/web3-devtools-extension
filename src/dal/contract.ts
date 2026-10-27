import { Abi } from "viem";

// A public registry of verified contracts an ABI can be fetched from
export type AbiSourceName = "sourcify" | "etherscan";

export interface Contract {
  address: `0x${string}`;
  name: string;
  abi: Abi;
  // The ABI Source it was fetched from; none once the user saves it
  source?: AbiSourceName;
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

// Each change reads and writes the whole store, so changes run one at a time:
// automatic fetches save while the user edits, and none may lose another
let lastChange: Promise<unknown> = Promise.resolve();
const changeContracts = <T>(
  change: (contracts: ContractStore) => T | undefined,
): Promise<T | undefined> => {
  const run = lastChange.then(async () => {
    const contracts = await getContracts();
    const result = change(contracts);
    if (result !== undefined) {
      await chrome.storage.local.set({ contracts });
    }
    return result;
  });
  lastChange = run.catch(() => {});
  return run;
};

export async function saveContract(contract: Contract): Promise<Contract> {
  const saved = { ...contract, address: normalizeAddress(contract.address) };
  await changeContracts((contracts) => {
    contracts[saved.address] = saved;
    return true;
  });
  return saved;
}

// Saves a Contract fetched from an ABI Source unless the address already has
// one; resolves to whether it was saved
export async function saveFetchedContract(
  contract: Contract & { source: AbiSourceName },
): Promise<boolean> {
  const saved = { ...contract, address: normalizeAddress(contract.address) };
  const result = await changeContracts((contracts) => {
    if (contracts[saved.address]) {
      return undefined;
    }
    contracts[saved.address] = saved;
    return true;
  });
  return result === true;
}

export async function getContract(
  address: `0x${string}`,
): Promise<Contract | null> {
  const contracts = await getContracts();
  return contracts[normalizeAddress(address)] ?? null;
}

export async function deleteContract(address: `0x${string}`): Promise<void> {
  await changeContracts((contracts) => {
    delete contracts[normalizeAddress(address)];
    return true;
  });
}
