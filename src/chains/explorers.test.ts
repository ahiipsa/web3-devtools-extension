import { describe, expect, it } from "vitest";
import { getExplorerUrl } from "./explorers.ts";

const ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const HASH =
  "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";

describe("getExplorerUrl", () => {
  it("links an address on Base to Basescan", () => {
    expect(getExplorerUrl(8453, { kind: "address", value: ADDRESS })).toBe(
      `https://basescan.org/address/${ADDRESS}`,
    );
  });

  it("links a transaction hash and a block number on Ethereum to Etherscan", () => {
    expect(getExplorerUrl(1, { kind: "transaction", value: HASH })).toBe(
      `https://etherscan.io/tx/${HASH}`,
    );
    expect(getExplorerUrl(1, { kind: "block", value: "21000000" })).toBe(
      "https://etherscan.io/block/21000000",
    );
  });

  it("links a hex block number by its decimal number", () => {
    expect(getExplorerUrl(1, { kind: "block", value: "0x1406f40" })).toBe(
      "https://etherscan.io/block/21000000",
    );
  });

  it("falls back to Blockscout for a Chain without an Etherscan-family Explorer", () => {
    expect(getExplorerUrl(10200, { kind: "address", value: ADDRESS })).toBe(
      `https://gnosis-chiado.blockscout.com/address/${ADDRESS}`,
    );
  });

  it("gives no link on a local Chain, an unknown Chain or without a Chain", () => {
    const address = { kind: "address", value: ADDRESS } as const;
    expect(getExplorerUrl(31337, address)).toBeUndefined();
    expect(getExplorerUrl(1337, address)).toBeUndefined();
    expect(getExplorerUrl(999999, address)).toBeUndefined();
    expect(getExplorerUrl(undefined, address)).toBeUndefined();
  });

  it("gives no link for a block number it cannot read", () => {
    expect(
      getExplorerUrl(1, { kind: "block", value: "latest" }),
    ).toBeUndefined();
    expect(getExplorerUrl(1, { kind: "block", value: "" })).toBeUndefined();
  });
});
