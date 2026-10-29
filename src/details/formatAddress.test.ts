import { describe, expect, it } from "vitest";
import {
  formatAddress,
  formatContractName,
  formatShortAddress,
} from "./formatAddress.ts";

describe("formatAddress", () => {
  it("writes a whole address in checksum case", () => {
    expect(formatAddress("0xbcca60bb61934080951369a648fb03df4f96263c")).toBe(
      "0xBcca60bB61934080951369a648Fb03DF4F96263C",
    );
  });

  it("leaves a value that is not an address as it is", () => {
    expect(formatAddress("0x1234")).toBe("0x1234");
  });
});

describe("formatShortAddress", () => {
  it("keeps the first 4 and last 4 hex digits in checksum case", () => {
    expect(
      formatShortAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
    ).toBe("0xA0b8…eB48");
  });
});

describe("formatContractName", () => {
  const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

  it("shows the name the Contract has", () => {
    expect(formatContractName({ address: USDC, name: "FiatTokenProxy" })).toBe(
      "FiatTokenProxy",
    );
  });

  it("shows the old fallback name of a fetched Contract as its short address", () => {
    expect(formatContractName({ address: USDC, name: "0xa0b8...eb48" })).toBe(
      "0xA0b8…eB48",
    );
  });

  it("knows the old fallback name cut from the address in checksum case", () => {
    expect(formatContractName({ address: USDC, name: "0xA0b8...eB48" })).toBe(
      "0xA0b8…eB48",
    );
  });

  it("leaves a name like an address cut that is not its own", () => {
    for (const name of ["0xabc...", "0xa0b8...eb49", "0xa0b8..eb48"]) {
      expect(formatContractName({ address: USDC, name })).toBe(name);
    }
  });

  it("leaves an empty name empty", () => {
    expect(formatContractName({ address: USDC, name: "" })).toBe("");
  });
});
