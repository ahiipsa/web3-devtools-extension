import { describe, expect, it } from "vitest";
import {
  formatBlockParam,
  formatChainMethodResult,
  formatChainMethodResultInline,
  formatStateOverride,
  getNamedParams,
  groupThousands,
  ValueLine,
} from "./chainMethods.ts";

const HOLDER = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const HASH =
  "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060";
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

// A line as it reads, with the muted parts in [brackets]
const read = (lines: ValueLine[] | undefined) =>
  lines?.map(({ label, parts }) =>
    [
      label ? `${label}: ` : "",
      ...parts.map(({ text, muted }) => (muted ? `[${text}]` : text)),
    ].join(""),
  );

const copies = (lines: ValueLine[] | undefined) =>
  lines?.flatMap(({ parts }) =>
    parts.flatMap((part) => (part.kind === "value" ? [part.value] : [])),
  );

describe("groupThousands", () => {
  it("separates thousands with commas, leaving a fraction alone", () => {
    expect(groupThousands("20000000")).toBe("20,000,000");
    expect(groupThousands("999")).toBe("999");
    expect(groupThousands("1234.56789")).toBe("1,234.56789");
    expect(groupThousands("0.0123")).toBe("0.0123");
  });
});

describe("formatChainMethodResult", () => {
  it("reads a balance in ETH on Ethereum, with its wei", () => {
    const lines = formatChainMethodResult(
      "eth_getBalance",
      "0x2386f26fc10000",
      1,
    );
    expect(read(lines)).toEqual(["0.01 ETH[ · ][10,000,000,000,000,000 wei]"]);
    expect(copies(lines)).toEqual(["0.01", "10000000000000000"]);
  });

  it("reads a balance in POL on Polygon and native on an unknown Chain", () => {
    expect(
      read(formatChainMethodResult("eth_getBalance", "0x2386f26fc10000", 137)),
    ).toEqual(["0.01 POL[ · ][10,000,000,000,000,000 wei]"]);
    expect(
      read(
        formatChainMethodResult(
          "eth_getBalance",
          "0x2386f26fc10000",
          undefined,
        ),
      ),
    ).toEqual(["0.01 native[ · ][10,000,000,000,000,000 wei]"]);
  });

  it("reads a block number with ↗ to the block and copies the bare number", () => {
    const lines = formatChainMethodResult("eth_blockNumber", "0x1312d00", 1);
    expect(read(lines)).toEqual(["20,000,000[ · ][0x1312d00]"]);
    expect(lines?.[0].parts[0]).toEqual({
      kind: "value",
      text: "20,000,000",
      value: "20000000",
      explorer: "block",
    });
    expect(copies(lines)).toEqual(["20000000", "0x1312d00"]);
  });

  it("names a known chain id", () => {
    expect(
      read(formatChainMethodResult("eth_chainId", "0x2105", undefined)),
    ).toEqual(["8453 · Base[ · ][0x2105]"]);
    expect(
      read(formatChainMethodResult("eth_chainId", "0xf423f", undefined)),
    ).toEqual(["999999[ · ][0xf423f]"]);
  });

  it("reads gas prices and fees in gwei", () => {
    for (const method of [
      "eth_gasPrice",
      "eth_maxPriorityFeePerGas",
      "eth_blobBaseFee",
    ]) {
      expect(read(formatChainMethodResult(method, "0xbbaee0", 1))).toEqual([
        "0.0123 gwei[ · ][12,300,000 wei]",
      ]);
    }
  });

  it("reads gas and a nonce", () => {
    expect(
      read(formatChainMethodResult("eth_estimateGas", "0xc822", 1)),
    ).toEqual(["51,234 gas[ · ][0xc822]"]);
    expect(
      read(formatChainMethodResult("eth_getTransactionCount", "0x8e", 1)),
    ).toEqual(["142[ · ][0x8e]"]);
  });

  it("reads each outcome of eth_getCode", () => {
    expect(
      read(formatChainMethodResult("eth_getCode", `0x${"60".repeat(4300)}`, 1)),
    ).toEqual(["Contract · 4.2 KB of bytecode"]);
    expect(read(formatChainMethodResult("eth_getCode", "0x6080", 1))).toEqual([
      "Contract · 2 bytes of bytecode",
    ]);
    expect(read(formatChainMethodResult("eth_getCode", "0x", 1))).toEqual([
      "No code[ · a wallet, or nothing deployed]",
    ]);
    const delegated = formatChainMethodResult(
      "eth_getCode",
      `0xef0100${HOLDER.slice(2).toLowerCase()}`,
      1,
    );
    expect(read(delegated)).toEqual([`Delegated to ${HOLDER}[ · EIP-7702]`]);
    expect(delegated?.[0].parts[1]).toMatchObject({ explorer: "address" });
  });

  it("reads a storage word as an address when its top 12 bytes are zero", () => {
    const word = `0x${"0".repeat(24)}${HOLDER.slice(2).toLowerCase()}`;
    const lines = formatChainMethodResult("eth_getStorageAt", word, 1);
    expect(read(lines)).toEqual([
      `as uint256: ${groupThousands(BigInt(word).toString())}`,
      `as address: ${HOLDER}`,
    ]);
    expect(lines?.[1].parts[0]).toMatchObject({ explorer: "address" });
  });

  it("reads another storage word as a number alone", () => {
    expect(
      read(formatChainMethodResult("eth_getStorageAt", HASH, 1)),
    ).toHaveLength(1);
    expect(
      read(
        formatChainMethodResult("eth_getStorageAt", `0x${"0".repeat(64)}`, 1),
      ),
    ).toEqual(["as uint256: 0"]);
  });

  it("leaves other methods and results that do not read", () => {
    expect(formatChainMethodResult("eth_call", "0x01", 1)).toBeUndefined();
    expect(formatChainMethodResult("eth_blockNumber", 5, 1)).toBeUndefined();
    expect(formatChainMethodResult("eth_getCode", "0x123", 1)).toBeUndefined();
  });
});

describe("formatChainMethodResultInline", () => {
  it("is the main value without its raw form", () => {
    expect(
      formatChainMethodResultInline("eth_getBalance", "0x2386f26fc10000", 1),
    ).toBe("0.01 ETH");
    expect(formatChainMethodResultInline("eth_chainId", "0x2105", 1)).toBe(
      "8453 · Base",
    );
    expect(formatChainMethodResultInline("eth_getCode", "0x", 1)).toBe(
      "No code",
    );
    expect(formatChainMethodResultInline("eth_call", "0x", 1)).toBeUndefined();
  });
});

describe("formatBlockParam", () => {
  it("keeps a tag as is", () => {
    expect(formatBlockParam("latest")).toEqual({
      parts: [{ kind: "text", text: "latest" }],
      inline: "latest",
    });
  });

  it("reads a number in decimal with its hex and ↗", () => {
    const block = formatBlockParam("0x1312918");
    expect(block.inline).toBe("19,999,000");
    expect(block.parts[0]).toEqual({
      kind: "value",
      text: "19,999,000",
      value: "19999000",
      explorer: "block",
    });
    expect(block.parts.at(-1)).toMatchObject({
      text: "0x1312918",
      muted: true,
    });
  });

  it("reads a hash and an EIP-1898 object", () => {
    expect(formatBlockParam(HASH)).toEqual({
      parts: [{ kind: "value", text: HASH, value: HASH, explorer: "block" }],
      inline: "0x5c50…2060",
    });
    expect(
      formatBlockParam({ blockHash: HASH, requireCanonical: true }),
    ).toEqual(formatBlockParam(HASH));
    expect(formatBlockParam({ blockNumber: "0x1312918" })).toEqual(
      formatBlockParam("0x1312918"),
    );
    expect(formatBlockParam({ blockNumber: "0x0" }).inline).toBe("0");
  });

  it("shows anything else as JSON", () => {
    expect(formatBlockParam({ foo: 1 }).inline).toBe('{"foo":1}');
  });
});

describe("getNamedParams", () => {
  it("names eth_getBalance's address and block", () => {
    const params = getNamedParams("eth_getBalance", [
      HOLDER.toLowerCase(),
      "latest",
    ]);
    expect(params?.map(({ name, inline }) => [name, inline])).toEqual([
      ["address", "0xd8dA…6045"],
      ["block", "latest"],
    ]);
    expect(params?.[0].parts).toEqual([
      { kind: "value", text: HOLDER, value: HOLDER, explorer: "address" },
    ]);
  });

  it("names eth_getStorageAt's slot, short inline", () => {
    expect(
      getNamedParams("eth_getStorageAt", [HOLDER, IMPLEMENTATION_SLOT])?.map(
        ({ name, inline }) => [name, inline],
      ),
    ).toEqual([
      ["address", "0xd8dA…6045"],
      ["slot", "0x3608…2bbc"],
    ]);
  });

  it("has none for a method without named params or params not in an array", () => {
    expect(getNamedParams("eth_blockNumber", [])).toBeUndefined();
    expect(
      getNamedParams("eth_getBalance", { address: HOLDER }),
    ).toBeUndefined();
  });
});

describe("formatStateOverride", () => {
  it("counts the overridden addresses", () => {
    expect(formatStateOverride({ [HOLDER]: {}, [HASH]: {} })).toBe(
      "2 addresses",
    );
    expect(formatStateOverride({ [HOLDER]: {} })).toBe("1 address");
  });

  it("is nothing without an override", () => {
    expect(formatStateOverride(undefined)).toBeUndefined();
    expect(formatStateOverride({})).toBeUndefined();
    expect(formatStateOverride([])).toBeUndefined();
  });
});
