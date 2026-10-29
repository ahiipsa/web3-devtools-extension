import { describe, expect, it } from "vitest";
import { formatAbiFetchState } from "./formatAbiFetchState.ts";
import { AbiFetchState } from "./abiFetcher.ts";
import {
  AbiSourceOutcomes,
  EtherscanOutcome,
  SourcifyOutcome,
} from "./abiSources.ts";

const missed = (
  sourcify: SourcifyOutcome,
  etherscan: EtherscanOutcome,
): AbiFetchState => ({ kind: "missed", outcomes: { sourcify, etherscan } });

const SOURCIFY_MISS: SourcifyOutcome = { kind: "not-found" };
const SOURCIFY_DOWN: SourcifyOutcome = { kind: "failed", reason: "HTTP 503" };

const text = (state: AbiFetchState) =>
  formatAbiFetchState(state)
    ?.segments.map((segment) => segment.text)
    .join("");

describe("formatAbiFetchState", () => {
  it("says nothing while idle", () => {
    expect(formatAbiFetchState({ kind: "idle" })).toBeUndefined();
  });

  it("says the ABI is being fetched", () => {
    expect(text({ kind: "fetching" })).toBe("Fetching ABI…");
  });

  it("says why a fetch failed outside the ABI Sources", () => {
    expect(formatAbiFetchState({ kind: "failed", reason: "HTTP 401" })).toEqual(
      { segments: [{ text: "Fetch failed: HTTP 401", tone: "failed" }] },
    );
  });

  it.each<[string, AbiSourceOutcomes, string]>([
    [
      "neither has the ABI",
      { sourcify: SOURCIFY_MISS, etherscan: { kind: "not-found" } },
      "No verified ABI on Sourcify or Etherscan",
    ],
    [
      "a Sourcify miss without a key",
      { sourcify: SOURCIFY_MISS, etherscan: { kind: "not-asked" } },
      "No verified ABI on Sourcify",
    ],
    [
      "a Sourcify miss on a Chain Etherscan does not serve",
      { sourcify: SOURCIFY_MISS, etherscan: { kind: "unsupported-chain" } },
      "No verified ABI on Sourcify",
    ],
    [
      "a Sourcify miss on a Chain that needs a paid plan",
      {
        sourcify: SOURCIFY_MISS,
        etherscan: { kind: "paid-plan", chainId: 8453 },
      },
      "No verified ABI on Sourcify · Etherscan needs a paid plan for Base",
    ],
    [
      "a paid plan on a Chain without a name",
      {
        sourcify: SOURCIFY_MISS,
        etherscan: { kind: "paid-plan", chainId: 999999 },
      },
      "No verified ABI on Sourcify · Etherscan needs a paid plan for 999999",
    ],
    [
      "a Sourcify miss and an invalid key",
      { sourcify: SOURCIFY_MISS, etherscan: { kind: "invalid-key" } },
      "No verified ABI on Sourcify · Etherscan API key is invalid",
    ],
    [
      "a Sourcify failure and an invalid key",
      { sourcify: SOURCIFY_DOWN, etherscan: { kind: "invalid-key" } },
      "Sourcify: HTTP 503 · Etherscan API key is invalid",
    ],
    [
      "a Sourcify miss and Etherscan's rate limit",
      { sourcify: SOURCIFY_MISS, etherscan: { kind: "rate-limit" } },
      "No verified ABI on Sourcify · Etherscan rate limit, try again in a moment",
    ],
    [
      "a Sourcify failure and Etherscan's rate limit",
      { sourcify: SOURCIFY_DOWN, etherscan: { kind: "rate-limit" } },
      "Sourcify: HTTP 503 · Etherscan rate limit, try again in a moment",
    ],
    [
      "both failing",
      {
        sourcify: SOURCIFY_DOWN,
        etherscan: { kind: "failed", reason: "Query Timeout occured" },
      },
      "Sourcify: HTTP 503 · Etherscan: Query Timeout occured",
    ],
    [
      "a Sourcify miss and an Etherscan failure",
      {
        sourcify: SOURCIFY_MISS,
        etherscan: { kind: "failed", reason: "HTTP 502" },
      },
      "No verified ABI on Sourcify · Etherscan: HTTP 502",
    ],
    [
      "a Sourcify failure and an Etherscan miss",
      { sourcify: SOURCIFY_DOWN, etherscan: { kind: "not-found" } },
      "Sourcify: HTTP 503 · No verified ABI on Etherscan",
    ],
    [
      "a Sourcify failure without a key",
      { sourcify: SOURCIFY_DOWN, etherscan: { kind: "not-asked" } },
      "Sourcify is unavailable (HTTP 503) · add an Etherscan API key to try Etherscan",
    ],
    [
      "a Sourcify failure on a Chain Etherscan does not serve",
      { sourcify: SOURCIFY_DOWN, etherscan: { kind: "unsupported-chain" } },
      "Sourcify: HTTP 503",
    ],
  ])("reads %s", (_, outcomes, expected) => {
    expect(text({ kind: "missed", outcomes })).toBe(expected);
  });

  it("marks failures as failed and misses as muted", () => {
    expect(
      formatAbiFetchState(
        missed(SOURCIFY_DOWN, { kind: "paid-plan", chainId: 8453 }),
      )?.segments,
    ).toEqual([
      { text: "Sourcify: HTTP 503", tone: "failed" },
      { text: " · ", tone: "muted" },
      { text: "Etherscan needs a paid plan for Base", tone: "muted" },
    ]);
    expect(
      formatAbiFetchState(missed(SOURCIFY_MISS, { kind: "rate-limit" }))
        ?.segments,
    ).toEqual([
      { text: "No verified ABI on Sourcify", tone: "muted" },
      { text: " · ", tone: "muted" },
      {
        text: "Etherscan rate limit, try again in a moment",
        tone: "failed",
      },
    ]);
    expect(
      formatAbiFetchState(missed(SOURCIFY_DOWN, { kind: "not-asked" }))
        ?.segments,
    ).toEqual([
      { text: "Sourcify is unavailable (HTTP 503)", tone: "failed" },
      { text: " · ", tone: "muted" },
      { text: "add an Etherscan API key to try Etherscan", tone: "muted" },
    ]);
  });

  it("offers the settings when Etherscan says the key is invalid", () => {
    expect(
      formatAbiFetchState(missed(SOURCIFY_DOWN, { kind: "invalid-key" }))
        ?.openSettings,
    ).toBe(true);
  });

  it("offers the settings beside the hint to add a key while Sourcify is down", () => {
    expect(
      formatAbiFetchState(missed(SOURCIFY_DOWN, { kind: "not-asked" }))
        ?.openSettings,
    ).toBe(true);
  });

  it("offers the settings when Etherscan needs a paid plan, which a paid key fixes", () => {
    expect(
      formatAbiFetchState(
        missed(SOURCIFY_MISS, { kind: "paid-plan", chainId: 8453 }),
      )?.openSettings,
    ).toBe(true);
  });

  it.each<[string, AbiFetchState]>([
    [
      "Etherscan is rate limited",
      missed(SOURCIFY_MISS, { kind: "rate-limit" }),
    ],
    [
      "Sourcify missed without a key",
      missed(SOURCIFY_MISS, { kind: "not-asked" }),
    ],
  ])("offers no settings when %s", (_, state) => {
    expect(formatAbiFetchState(state)?.openSettings).toBeUndefined();
  });

  describe("for a proxy's implementation", () => {
    const IMPLEMENTATION = "0x43506849d7c04f9138d1a2050bbf3a0c054402dd";
    const implementationMissed = (
      sourcify: SourcifyOutcome,
      etherscan: EtherscanOutcome,
    ): AbiFetchState => ({
      kind: "missed",
      outcomes: { sourcify, etherscan },
      implementation: IMPLEMENTATION,
    });

    it("says the outcomes are the implementation's, its address on hover", () => {
      expect(
        formatAbiFetchState(
          implementationMissed(SOURCIFY_MISS, {
            kind: "paid-plan",
            chainId: 8453,
          }),
        ),
      ).toEqual({
        segments: [
          { text: "Implementation: ", tone: "muted", title: "0x4350…02dd" },
          { text: "No verified ABI on Sourcify", tone: "muted" },
          { text: " · ", tone: "muted" },
          { text: "Etherscan needs a paid plan for Base", tone: "muted" },
        ],
        openSettings: true,
      });
    });

    it("prefixes a failure too", () => {
      expect(
        text(implementationMissed(SOURCIFY_DOWN, { kind: "not-asked" })),
      ).toBe(
        "Implementation: Sourcify is unavailable (HTTP 503) · add an Etherscan API key to try Etherscan",
      );
    });

    it("does not prefix the miss of an address that is no proxy", () => {
      expect(
        text(missed(SOURCIFY_MISS, { kind: "paid-plan", chainId: 8453 })),
      ).toBe(
        "No verified ABI on Sourcify · Etherscan needs a paid plan for Base",
      );
    });
  });
});
