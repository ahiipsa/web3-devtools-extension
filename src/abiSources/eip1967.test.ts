import { describe, expect, it, vi } from "vitest";
import { readEip1967Implementation } from "./eip1967.ts";

const ENDPOINT = "https://rpc.example/v1";
const PROXY = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const IMPLEMENTATION = "0x43506849d7c04f9138d1a2050bbf3a0c054402dd";
const BEACON = "0x5a2a4f2f3c18f09179b6703e63d9edd165909073";
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const ZERO_WORD = `0x${"0".repeat(64)}`;

const word = (address: string) => `0x${"0".repeat(24)}${address.slice(2)}`;

interface RpcBody {
  method: string;
  params: unknown[];
}

// A node holding `storage` (by `${address}:${slot}`) whose beacon answers
// implementation() with `beaconImplementation`
const node = (storage: Record<string, string>, beaconImplementation?: string) =>
  vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as RpcBody & { id: number };
    let result: string = ZERO_WORD;
    if (body.method === "eth_getStorageAt") {
      const [address, slot] = body.params as string[];
      result = storage[`${address}:${slot}`] ?? ZERO_WORD;
    } else if (body.method === "eth_call" && beaconImplementation) {
      result = word(beaconImplementation);
    }
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
    );
  });

const sentBodies = (fetchFn: ReturnType<typeof node>) =>
  fetchFn.mock.calls.map(([, init]) => {
    const { method, params } = JSON.parse(String(init?.body)) as RpcBody;
    return { method, params };
  });

describe("readEip1967Implementation", () => {
  it("reads the implementation slot of the proxy on the Endpoint", async () => {
    const fetchFn = node({
      [`${PROXY}:${IMPLEMENTATION_SLOT}`]: word(
        "0x43506849D7C04F9138D1A2050bbF3A0c054402dd",
      ),
    });

    expect(await readEip1967Implementation(ENDPOINT, PROXY, fetchFn)).toBe(
      IMPLEMENTATION,
    );
    expect(fetchFn).toHaveBeenCalledWith(ENDPOINT, expect.anything());
    expect(sentBodies(fetchFn)).toEqual([
      {
        method: "eth_getStorageAt",
        params: [PROXY, IMPLEMENTATION_SLOT, "latest"],
      },
    ]);
  });

  it("asks the beacon for its implementation when only the beacon slot is set", async () => {
    const fetchFn = node(
      { [`${PROXY}:${BEACON_SLOT}`]: word(BEACON) },
      IMPLEMENTATION,
    );

    expect(await readEip1967Implementation(ENDPOINT, PROXY, fetchFn)).toBe(
      IMPLEMENTATION,
    );
    expect(sentBodies(fetchFn)).toEqual([
      {
        method: "eth_getStorageAt",
        params: [PROXY, IMPLEMENTATION_SLOT, "latest"],
      },
      { method: "eth_getStorageAt", params: [PROXY, BEACON_SLOT, "latest"] },
      {
        method: "eth_call",
        params: [{ to: BEACON, data: "0x5c60da1b" }, "latest"],
      },
    ]);
  });

  it("finds nothing when both slots are empty", async () => {
    const fetchFn = node({}, IMPLEMENTATION);

    expect(
      await readEip1967Implementation(ENDPOINT, PROXY, fetchFn),
    ).toBeUndefined();
    expect(sentBodies(fetchFn).map(({ method }) => method)).toEqual([
      "eth_getStorageAt",
      "eth_getStorageAt",
    ]);
  });

  it("finds nothing when the beacon names no implementation", async () => {
    const fetchFn = node({ [`${PROXY}:${BEACON_SLOT}`]: word(BEACON) });

    expect(
      await readEip1967Implementation(ENDPOINT, PROXY, fetchFn),
    ).toBeUndefined();
  });

  it("fails when the Endpoint answers with an RPC error", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32601, message: "method not found" },
          }),
        ),
    );

    await expect(
      readEip1967Implementation(ENDPOINT, PROXY, fetchFn),
    ).rejects.toThrow("method not found");
  });
});
