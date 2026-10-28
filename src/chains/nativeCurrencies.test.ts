import { describe, expect, it } from "vitest";
import { getNativeCurrency } from "./nativeCurrencies.ts";
import { NAMED_CHAIN_IDS } from "./chainNames.ts";

describe("getNativeCurrency", () => {
  it("is ETH on Ethereum and a local Chain, POL on Polygon", () => {
    expect(getNativeCurrency(1)).toBe("ETH");
    expect(getNativeCurrency(31337)).toBe("ETH");
    expect(getNativeCurrency(137)).toBe("POL");
    expect(getNativeCurrency(100)).toBe("xDAI");
  });

  it("is native on a Chain not in the table or not yet known", () => {
    expect(getNativeCurrency(999999)).toBe("native");
    expect(getNativeCurrency(undefined)).toBe("native");
  });

  it("knows every named Chain", () => {
    for (const chainId of NAMED_CHAIN_IDS) {
      expect(getNativeCurrency(chainId), String(chainId)).not.toBe("native");
    }
  });
});
