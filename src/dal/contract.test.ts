import { beforeEach, describe, expect, it, vi } from "vitest";
import { Abi } from "viem";
import { getContract, parseAbiJson, saveContract } from "./contract.ts";

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

  it("returns null for an address without a Contract", async () => {
    expect(await getContract(LOWER_CASE)).toBeNull();
  });
});

describe("parseAbiJson", () => {
  it("parses a pasted JSON ABI", () => {
    expect(parseAbiJson(JSON.stringify(erc20Abi))).toEqual(erc20Abi);
  });

  it.each([
    ["not JSON", "{ nope", "ABI is not valid JSON"],
    ["not an array", '{"type":"function"}', "ABI must be a JSON array"],
    ["an empty array", "[]", "ABI has no entries"],
    ["an entry without a type", '[{"name":"foo"}]', "ABI entry 0 has no type"],
  ])("rejects %s", (_case, input, message) => {
    expect(() => parseAbiJson(input)).toThrow(message);
  });
});
