import { describe, expect, it } from "vitest";
import { getDetailsTabs, getShownDetailsTab } from "./detailsTabs.ts";

describe("RPC Request details tabs", () => {
  it("offers the Contract tab only for an RPC Request to a contract", () => {
    expect(getDetailsTabs(false)).toEqual(["Overview", "Params", "Response"]);
    expect(getDetailsTabs(true)).toEqual([
      "Overview",
      "Params",
      "Response",
      "Contract",
    ]);
  });

  it("shows the selected tab when the RPC Request has it", () => {
    expect(getShownDetailsTab("Response", false)).toBe("Response");
    expect(getShownDetailsTab("Contract", true)).toBe("Contract");
  });

  it("falls back to Overview when the selected tab is the Contract one but no contract is called", () => {
    expect(getShownDetailsTab("Contract", false)).toBe("Overview");
  });
});
