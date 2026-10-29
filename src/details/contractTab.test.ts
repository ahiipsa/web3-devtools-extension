import { describe, expect, it } from "vitest";
import { parseAbi } from "viem";
import {
  ContractTabHeader,
  formatInnerCallTargetTitle,
  getContractTabActions,
  getContractTabHeader,
  getContractTabKind,
} from "./contractTab.ts";
import { Contract } from "../dal/contract.ts";

const ADDRESS = "0x1111111111111111111111111111111111111111";
const IMPLEMENTATION = "0x2222222222222222222222222222222222222222";
const abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const own: Contract = { address: ADDRESS, name: "Token", abi };
const fetched: Contract = { ...own, source: "sourcify" };
const builtIn = { name: "Multicall3", abi };
const IDLE = { kind: "idle" } as const;

const text = (header: ContractTabHeader) =>
  header.segments.map((segment) => segment.text).join("");

describe("getContractTabActions", () => {
  it("says Forget fetches the ABI again when DevTools opens while fetching is automatic", () => {
    expect(getContractTabActions("fetched", true).remove?.question).toBe(
      "Forget the fetched ABI? It is fetched again the next time DevTools opens.",
    );
  });

  it("says Fetch ABI fetches it again while fetching is not automatic", () => {
    expect(getContractTabActions("fetched", false).remove?.question).toBe(
      "Forget the fetched ABI? Fetch ABI fetches it again.",
    );
  });

  it("keeps Delete's question whatever the setting", () => {
    const question =
      "Delete this Contract? Its RPC Requests will no longer be decoded.";
    expect(getContractTabActions("own", true).remove?.question).toBe(question);
    expect(getContractTabActions("own", false).remove?.question).toBe(question);
  });
});

describe("getContractTabKind", () => {
  it("tells an own, a fetched, a built-in and no Contract apart", () => {
    expect(getContractTabKind(own, undefined)).toBe("own");
    expect(getContractTabKind(fetched, builtIn)).toBe("fetched");
    expect(getContractTabKind(null, builtIn)).toBe("built-in");
    expect(getContractTabKind(null, undefined)).toBe("none");
  });
});

describe("getContractTabHeader", () => {
  const header = (input: Partial<Parameters<typeof getContractTabHeader>[0]>) =>
    getContractTabHeader({
      contract: null,
      builtIn: undefined,
      fetchState: IDLE,
      hasEtherscanKey: false,
      ...input,
    });

  it("says an own Contract is saved by the user, with no action", () => {
    const result = header({ contract: own });
    expect(text(result)).toBe("Saved by you");
    expect(result.fetchAbi).toBeUndefined();
  });

  it("names the ABI Source of a fetched Contract", () => {
    expect(text(header({ contract: fetched }))).toBe("Sourcify");
    expect(text(header({ contract: { ...own, source: "etherscan" } }))).toBe(
      "Etherscan",
    );
  });

  it("shows the implementation of a Contract fetched via proxy", () => {
    const result = header({
      contract: {
        ...fetched,
        proxy: { implementation: IMPLEMENTATION, abi: "implementation" },
      },
    });
    expect(text(result)).toBe("Sourcify · via proxy · implementation ");
    expect(result.implementation).toBe(IMPLEMENTATION);
  });

  it("keeps the wording of a proxy's own ABI", () => {
    const result = header({
      contract: {
        ...fetched,
        proxy: { implementation: IMPLEMENTATION, abi: "proxy" },
      },
    });
    expect(text(result)).toBe(
      "Sourcify · proxy's own ABI: its implementation has no verified ABI",
    );
    expect(result.implementation).toBeUndefined();
  });

  it("says a Contract stored before ABI Sources is saved by the user", () => {
    expect(text(header({ contract: own, builtIn }))).toBe("Saved by you");
  });

  it("names the built-in ABI for a Multicall address without a Contract", () => {
    const result = header({ builtIn });
    expect(text(result)).toBe("Built-in Multicall3 ABI");
    expect(result.fetchAbi).toBe("enabled");
  });

  it("adds the fetch state to the built-in ABI", () => {
    const result = header({ builtIn, fetchState: { kind: "fetching" } });
    expect(text(result)).toBe(
      "Built-in Multicall3 ABI · Fetching ABI from Sourcify…",
    );
    expect(result.fetchAbi).toBe("disabled");
  });

  it("names the ABI Sources being asked while fetching", () => {
    expect(text(header({ fetchState: { kind: "fetching" } }))).toBe(
      "Fetching ABI from Sourcify…",
    );
    expect(
      text(header({ fetchState: { kind: "fetching" }, hasEtherscanKey: true })),
    ).toBe("Fetching ABI from Sourcify or Etherscan…");
    expect(header({ fetchState: { kind: "fetching" } }).fetchAbi).toBe(
      "disabled",
    );
  });

  it("says a miss with what each ABI Source answered", () => {
    const result = header({
      fetchState: {
        kind: "missed",
        outcomes: {
          sourcify: { kind: "not-found" },
          etherscan: { kind: "not-found" },
        },
      },
    });
    expect(text(result)).toBe("No verified ABI on Sourcify or Etherscan");
    expect(result.fetchAbi).toBe("enabled");
    expect(result.openSettings).toBeUndefined();
  });

  it("offers the settings beside an invalid Etherscan API key", () => {
    const result = header({
      builtIn,
      fetchState: {
        kind: "missed",
        outcomes: {
          sourcify: { kind: "failed", reason: "HTTP 503" },
          etherscan: { kind: "invalid-key" },
        },
      },
    });
    expect(text(result)).toBe(
      "Built-in Multicall3 ABI · Sourcify: HTTP 503 · Etherscan API key is invalid",
    );
    expect(result.openSettings).toBe(true);
  });

  it("shows a failed fetch in red", () => {
    const result = header({
      fetchState: { kind: "failed", reason: "HTTP 500" },
    });
    expect(result.segments).toEqual([
      { text: "Fetch failed: HTTP 500", tone: "failed" },
    ]);
    expect(result.fetchAbi).toBe("enabled");
  });

  it("offers Fetch ABI for an address nothing was fetched for", () => {
    const result = header({});
    expect(text(result)).toBe("No ABI for this address");
    expect(result.fetchAbi).toBe("enabled");
  });
});

describe("formatInnerCallTargetTitle", () => {
  it("names the Inner Call and the Multicall it is in", () => {
    expect(
      formatInnerCallTargetTitle(
        1,
        "Multicall3",
        "0xca11bde05977b3631167028862be2a173976ca11",
      ),
    ).toBe("Inner Call #2 of Multicall3 0xcA11…CA11");
  });
});
