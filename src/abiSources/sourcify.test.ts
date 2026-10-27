import { describe, expect, it, vi } from "vitest";
import { fetchFromSourcify } from "./sourcify.ts";

const ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("fetchFromSourcify", () => {
  it("asks Sourcify for the ABI and compilation of the address on the Chain", async () => {
    const fetchFn = respond(200, { abi: ABI, compilation: { name: "WETH9" } });

    await fetchFromSourcify(1, ADDRESS, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(
      "https://sourcify.dev/server/v2/contract/1/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2?fields=abi,compilation,proxyResolution",
    );
  });

  it("returns the ABI named after the compiled contract on 200", async () => {
    const fetchFn = respond(200, { abi: ABI, compilation: { name: "WETH9" } });

    expect(await fetchFromSourcify(1, ADDRESS, fetchFn)).toEqual({
      kind: "found",
      name: "WETH9",
      abi: ABI,
    });
  });

  it("names the one implementation of a proxy", async () => {
    const fetchFn = respond(200, {
      abi: ABI,
      compilation: { name: "FiatTokenProxy" },
      proxyResolution: {
        isProxy: true,
        proxyType: "ZeppelinOSProxy",
        implementations: [
          {
            address: "0x43506849D7C04F9138D1A2050bbF3A0c054402dd",
            name: "FiatTokenV2_2",
          },
        ],
      },
    });

    expect(await fetchFromSourcify(1, ADDRESS, fetchFn)).toEqual({
      kind: "found",
      name: "FiatTokenProxy",
      abi: ABI,
      implementation: "0x43506849d7c04f9138d1a2050bbf3a0c054402dd",
    });
  });

  it("names no implementation when the proxy has several or none", async () => {
    const proxyResolution = (implementations: unknown) => ({
      abi: ABI,
      compilation: { name: "Diamond" },
      proxyResolution: { isProxy: true, implementations },
    });
    const several = [
      { address: "0x43506849D7C04F9138D1A2050bbF3A0c054402dd" },
      { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
    ];

    for (const body of [
      proxyResolution(several),
      proxyResolution([]),
      proxyResolution([{ address: "not an address" }]),
      { ...proxyResolution(several.slice(0, 1)), proxyResolution: null },
    ]) {
      expect(
        await fetchFromSourcify(1, ADDRESS, respond(200, body)),
      ).not.toHaveProperty("implementation");
    }
  });

  it("reports no verified ABI on 404", async () => {
    expect(
      await fetchFromSourcify(1, ADDRESS, respond(404, { message: "x" })),
    ).toEqual({ kind: "not-found" });
  });

  it("fails on another HTTP status", async () => {
    await expect(
      fetchFromSourcify(1, ADDRESS, respond(500, {})),
    ).rejects.toThrow("HTTP 500");
  });

  it("fails on a 200 without an ABI", async () => {
    await expect(
      fetchFromSourcify(1, ADDRESS, respond(200, { compilation: {} })),
    ).rejects.toThrow("no ABI");
  });
});
