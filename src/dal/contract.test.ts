import { beforeEach, describe, expect, it, vi } from "vitest";
import { Abi } from "viem";
import {
  deleteContract,
  getContract,
  getContracts,
  formatAbiSummary,
  parseAbiInput,
  saveContract,
  saveFetchedContract,
} from "./contract.ts";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

const MIXED_CASE = "0xAbCdEf000000000000000000000000000000AbCd";
const LOWER_CASE = "0xabcdef000000000000000000000000000000abcd";
const OTHER = "0x2222222222222222222222222222222222222222";

// In-memory stand-in for chrome.storage.local
const stubChromeStorage = () => {
  let store: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (keys: string | Record<string, unknown>) => {
          if (typeof keys === "string") {
            return keys in store ? { [keys]: store[keys] } : {};
          }
          return Object.fromEntries(
            Object.entries(keys).map(([key, fallback]) => [
              key,
              key in store ? store[key] : fallback,
            ]),
          );
        },
        set: async (items: Record<string, unknown>) => {
          store = { ...store, ...structuredClone(items) };
        },
      },
    },
  });
};

describe("Contract data layer", () => {
  beforeEach(() => {
    stubChromeStorage();
  });

  it("finds a Contract saved for a mixed-case address by its lowercase address", async () => {
    await saveContract({ address: MIXED_CASE, name: "Token", abi: erc20Abi });

    expect(await getContract(LOWER_CASE)).toEqual({
      address: LOWER_CASE,
      name: "Token",
      abi: erc20Abi,
    });
  });

  it("keeps one Contract per address whatever the case it is saved under", async () => {
    await saveContract({ address: LOWER_CASE, name: "Old", abi: [] });
    await saveContract({ address: MIXED_CASE, name: "New", abi: erc20Abi });

    expect(await getContract(LOWER_CASE)).toMatchObject({ name: "New" });
  });

  // Contracts saved before the ABI moved into the Contract have no `abi`
  it("ignores a Contract stored without an ABI", async () => {
    await chrome.storage.local.set({
      contracts: {
        [LOWER_CASE]: { contractAddress: LOWER_CASE, name: "Old", abiId: "x" },
      },
    });

    expect(await getContract(LOWER_CASE)).toBeNull();
    expect(await getContracts()).toEqual({});
  });

  it("keeps valid Contracts next to one stored without an ABI", async () => {
    await chrome.storage.local.set({
      contracts: { [LOWER_CASE]: { name: "Old", abiId: "x" } },
    });
    await saveContract({ address: OTHER, name: "Token", abi: erc20Abi });

    expect(Object.keys(await getContracts())).toEqual([OTHER]);
  });

  it("returns null for an address without a Contract", async () => {
    expect(await getContract(LOWER_CASE)).toBeNull();
  });

  it("deletes a Contract by its address in any case", async () => {
    await saveContract({ address: LOWER_CASE, name: "Token", abi: erc20Abi });

    await deleteContract(MIXED_CASE);

    expect(await getContract(LOWER_CASE)).toBeNull();
  });

  it("keeps other Contracts when one is deleted", async () => {
    const otherAddress = "0x1111111111111111111111111111111111111111";
    await saveContract({ address: LOWER_CASE, name: "Token", abi: erc20Abi });
    await saveContract({ address: otherAddress, name: "Other", abi: erc20Abi });

    await deleteContract(LOWER_CASE);

    expect(await getContract(otherAddress)).toMatchObject({ name: "Other" });
  });

  it("does nothing when deleting an address without a Contract", async () => {
    await expect(deleteContract(LOWER_CASE)).resolves.toBeUndefined();
  });
});

describe("saveFetchedContract", () => {
  beforeEach(() => {
    stubChromeStorage();
  });

  it("saves a fetched Contract with its ABI Source mark", async () => {
    const saved = await saveFetchedContract({
      address: MIXED_CASE,
      name: "WETH9",
      abi: erc20Abi,
      source: "sourcify",
    });

    expect(saved).toBe(true);
    expect(await getContract(LOWER_CASE)).toEqual({
      address: LOWER_CASE,
      name: "WETH9",
      abi: erc20Abi,
      source: "sourcify",
    });
  });

  it("never overwrites a Contract that is already stored", async () => {
    await saveContract({ address: LOWER_CASE, name: "Mine", abi: erc20Abi });

    const saved = await saveFetchedContract({
      address: MIXED_CASE,
      name: "WETH9",
      abi: [],
      source: "sourcify",
    });

    expect(saved).toBe(false);
    expect(await getContract(LOWER_CASE)).toEqual({
      address: LOWER_CASE,
      name: "Mine",
      abi: erc20Abi,
    });
  });

  it("keeps every Contract when several are saved at once", async () => {
    await Promise.all([
      saveFetchedContract({
        address: LOWER_CASE,
        name: "A",
        abi: erc20Abi,
        source: "sourcify",
      }),
      saveFetchedContract({
        address: OTHER,
        name: "B",
        abi: erc20Abi,
        source: "sourcify",
      }),
      deleteContract("0x3333333333333333333333333333333333333333"),
    ]);

    expect(Object.keys(await getContracts()).sort()).toEqual([
      OTHER,
      LOWER_CASE,
    ]);
  });

  it("drops the mark once the Contract is saved through the form", async () => {
    await saveFetchedContract({
      address: LOWER_CASE,
      name: "WETH9",
      abi: erc20Abi,
      source: "sourcify",
    });

    await saveContract({ address: LOWER_CASE, name: "WETH9", abi: erc20Abi });

    expect(await getContract(LOWER_CASE)).not.toHaveProperty("source");
  });
});

describe("parseAbiInput", () => {
  it("parses a pasted JSON ABI", () => {
    expect(parseAbiInput(JSON.stringify(erc20Abi))).toEqual(erc20Abi);
  });

  it("takes the ABI out of a Foundry or Hardhat build artifact", () => {
    const artifact = { abi: erc20Abi, bytecode: { object: "0x6080" } };
    expect(parseAbiInput(JSON.stringify(artifact, null, 2))).toEqual(erc20Abi);
  });

  it("takes the ABI out of an Etherscan getabi response", () => {
    const response = {
      status: "1",
      message: "OK",
      result: JSON.stringify(erc20Abi),
    };
    expect(parseAbiInput(JSON.stringify(response))).toEqual(erc20Abi);
  });

  it("parses human-readable lines, one per line, skipping blank ones", () => {
    const abi = parseAbiInput(
      [
        "function balanceOf(address owner) view returns (uint256)",
        "",
        "  event Transfer(address indexed from, address indexed to, uint256 value)",
        "error InsufficientBalance(uint256 available)",
      ].join("\n"),
    );
    expect(abi).toEqual([
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ type: "address", name: "owner" }],
        outputs: [{ type: "uint256" }],
      },
      {
        type: "event",
        name: "Transfer",
        inputs: [
          { type: "address", name: "from", indexed: true },
          { type: "address", name: "to", indexed: true },
          { type: "uint256", name: "value" },
        ],
      },
      {
        type: "error",
        name: "InsufficientBalance",
        inputs: [{ type: "uint256", name: "available" }],
      },
    ]);
  });

  it("resolves structs declared on their own lines", () => {
    const abi = parseAbiInput(
      "struct Call { address target; bytes callData; }\nfunction run(Call call)",
    );
    expect(abi).toEqual([
      {
        type: "function",
        name: "run",
        stateMutability: "nonpayable",
        inputs: [
          {
            type: "tuple",
            name: "call",
            components: [
              { type: "address", name: "target" },
              { type: "bytes", name: "callData" },
            ],
          },
        ],
        outputs: [],
      },
    ]);
  });

  it("names the line of a human-readable signature that does not parse", () => {
    expect(() =>
      parseAbiInput(
        "function balanceOf(address) view returns (uint256)\n\nfunction transfer(to, uint256)",
      ),
    ).toThrow('Line 3: Unknown type. Type "to" is not a valid ABI type.');
  });

  it("drops the trailing semicolon of a line from a Solidity interface", () => {
    expect(
      parseAbiInput("function totalSupply() external view returns (uint256);"),
    ).toEqual([
      {
        type: "function",
        name: "totalSupply",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "uint256" }],
      },
    ]);
  });

  it("names the line of a struct that does not parse", () => {
    expect(() =>
      parseAbiInput(
        "function run(Call call)\nstruct Call { address target bytes callData; }",
      ),
    ).toThrow(/^Line 2: /);
  });

  it("reads no line from text the engine's message quotes", () => {
    vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
      throw new SyntaxError(
        'Unexpected token x, "see line 42 x" is not valid JSON',
      );
    });
    expect(() => parseAbiInput('["see line 42" x]')).toThrow(
      /^ABI is not valid JSON$/,
    );
    vi.restoreAllMocks();
  });

  it("names the line of a JSON syntax error when the parser gives its position", () => {
    vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
      throw new SyntaxError("Unexpected token x in JSON at position 13");
    });
    expect(() => parseAbiInput('[\n  {"a":1},\n  x]')).toThrow(
      "Line 3: ABI is not valid JSON",
    );
    vi.restoreAllMocks();
  });

  it.each([
    ["not JSON", "{ nope", "ABI is not valid JSON"],
    [
      "an object without an abi array",
      '{"type":"function"}',
      'ABI must be a JSON array or an object with an "abi" array',
    ],
    ["an empty array", "[]", "ABI has no entries"],
    ["structs alone", "struct S { uint256 a; }", "ABI has no entries"],
    ["an entry without a type", '[{"name":"foo"}]', "ABI entry 0 has no type"],
  ])("rejects %s", (_case, input, message) => {
    expect(() => parseAbiInput(input)).toThrow(message);
  });
});

describe("formatAbiSummary", () => {
  it("counts functions, events and errors", () => {
    expect(
      formatAbiSummary(
        parseAbiInput(
          [
            "constructor(uint256 supply)",
            "function a()",
            "function b()",
            "event E()",
            "error X()",
            "error Y()",
            "error Z()",
          ].join("\n"),
        ),
      ),
    ).toBe("2 functions · 1 event · 3 errors");
  });

  it("says 0 for what the ABI lacks", () => {
    expect(formatAbiSummary(erc20Abi)).toBe("1 function · 0 events · 0 errors");
  });
});
