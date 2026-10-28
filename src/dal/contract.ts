import { Abi, parseAbi } from "viem";

// A public registry of verified contracts an ABI can be fetched from
export type AbiSourceName = "sourcify" | "etherscan";

// A fetched Contract at a proxy's address: the ABI is its implementation's,
// or the proxy's own when the implementation has no verified ABI
export interface ContractProxy {
  implementation: `0x${string}`;
  abi: "implementation" | "proxy";
}

export interface Contract {
  address: `0x${string}`;
  name: string;
  abi: Abi;
  // The ABI Source it was fetched from; none once the user saves it
  source?: AbiSourceName;
  proxy?: ContractProxy;
}

// A synchronous lookup over the Contract store, for whole lists of addresses
export type FindContract = (address: `0x${string}`) => Contract | undefined;

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

// The line of a JSON syntax error, when the parser names its position
const getJsonErrorLine = (json: string, error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const line = /line (\d+)/.exec(message);
  if (line) {
    return Number(line[1]);
  }
  const position = /position (\d+)/.exec(message);
  return position
    ? json.slice(0, Number(position[1])).split("\n").length
    : undefined;
};

const withLine = (message: string, line: number | undefined) =>
  line === undefined ? message : `Line ${line}: ${message}`;

const parseJsonAbi = (json: string): unknown[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      withLine("ABI is not valid JSON", getJsonErrorLine(json, error)),
    );
  }
  if (Array.isArray(parsed)) {
    return parsed;
  }
  // A Hardhat or Foundry build artifact, or an Etherscan getabi response,
  // whose `result` is the ABI as a JSON string
  const { abi, result } = (parsed ?? {}) as { abi?: unknown; result?: unknown };
  if (Array.isArray(abi)) {
    return abi;
  }
  if (typeof result === "string") {
    try {
      const resultAbi: unknown = JSON.parse(result);
      if (Array.isArray(resultAbi)) {
        return resultAbi;
      }
    } catch {
      // Not an ABI: falls through to the error below
    }
  }
  throw new Error('ABI must be a JSON array or an object with an "abi" array');
};

// viem's message is a title and then details on lines of their own
const formatParseAbiError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const { shortMessage, metaMessages } = error as Error & {
    shortMessage?: string;
    metaMessages?: string[];
  };
  return shortMessage
    ? [shortMessage, ...(metaMessages ?? [])].join(" ").trim()
    : error.message;
};

// One signature per line, as viem's parseAbi takes them; a struct line
// serves the others
const parseHumanReadableAbi = (text: string): unknown[] => {
  const lines = text.split("\n").map((line) => line.trim());
  const signatures = lines.filter(Boolean);
  try {
    return [...parseAbi(signatures)];
  } catch (error) {
    // Each line on its own with the structs finds the one at fault
    const structs = signatures.filter((line) => line.startsWith("struct "));
    const at = lines.findIndex((line) => {
      if (!line || line.startsWith("struct ")) {
        return false;
      }
      try {
        parseAbi([...structs, line]);
        return false;
      } catch {
        return true;
      }
    });
    throw new Error(
      withLine(formatParseAbiError(error), at === -1 ? undefined : at + 1),
    );
  }
};

// The ABI field's text: a JSON ABI array, a JSON object with an `abi` array,
// or human-readable signatures. Throws an Error whose message is fit to show
// the user, starting with the line at fault when it is known
export function parseAbiInput(text: string): Abi {
  const trimmed = text.trim();
  const parsed: unknown[] =
    trimmed.startsWith("[") || trimmed.startsWith("{")
      ? parseJsonAbi(text)
      : parseHumanReadableAbi(text);

  if (parsed.length === 0) {
    throw new Error("ABI has no entries");
  }

  parsed.forEach((entry, index) => {
    if (typeof (entry as { type?: unknown })?.type !== "string") {
      throw new Error(`ABI entry ${index} has no type`);
    }
  });

  return parsed as Abi;
}

const countOf = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

// Shown under the ABI field once it parses
export const formatAbiSummary = (abi: Abi) => {
  const count = (type: string) =>
    abi.filter((entry) => entry.type === type).length;
  return [
    countOf(count("function"), "function"),
    countOf(count("event"), "event"),
    countOf(count("error"), "error"),
  ].join(" · ");
};

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
