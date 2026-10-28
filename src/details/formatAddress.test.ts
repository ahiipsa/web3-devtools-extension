import { describe, expect, it } from "vitest";
import { formatAddress, formatShortAddress } from "./formatAddress.ts";

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
