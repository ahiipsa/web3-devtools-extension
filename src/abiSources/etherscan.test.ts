import { afterEach, describe, expect, it, vi } from "vitest";
import { createSerialQueue, fetchFromEtherscan } from "./etherscan.ts";

const ADDRESS = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const KEY = "SECRETKEY";
const ABI = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

const respond = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

const sourceCode = (fields: Record<string, string>) => ({
  status: "1",
  message: "OK",
  result: [{ SourceCode: "", ...fields }],
});

describe("fetchFromEtherscan", () => {
  it("asks Etherscan for the source code of the address on the Chain with the key", async () => {
    const fetchFn = respond(
      sourceCode({ ABI: JSON.stringify(ABI), ContractName: "WETH9" }),
    );

    await fetchFromEtherscan(1, ADDRESS, KEY, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith(
      `https://api.etherscan.io/v2/api?chainid=1&module=contract&action=getsourcecode&address=${ADDRESS}&apikey=${KEY}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns the ABI named after the contract of the first result", async () => {
    const fetchFn = respond(
      sourceCode({ ABI: JSON.stringify(ABI), ContractName: "WETH9" }),
    );

    expect(await fetchFromEtherscan(1, ADDRESS, KEY, fetchFn)).toEqual({
      kind: "found",
      name: "WETH9",
      abi: ABI,
    });
  });

  it("names the implementation of a proxy", async () => {
    const fetchFn = respond(
      sourceCode({
        ABI: JSON.stringify(ABI),
        ContractName: "FiatTokenProxy",
        Proxy: "1",
        Implementation: "0x43506849D7C04F9138D1A2050bbF3A0c054402dd",
      }),
    );

    expect(await fetchFromEtherscan(1, ADDRESS, KEY, fetchFn)).toEqual({
      kind: "found",
      name: "FiatTokenProxy",
      abi: ABI,
      implementation: "0x43506849d7c04f9138d1a2050bbf3a0c054402dd",
    });
  });

  it("names no implementation for a contract not marked as a proxy", async () => {
    for (const fields of [
      { Proxy: "0", Implementation: "" },
      {
        Proxy: "0",
        Implementation: "0x43506849D7C04F9138D1A2050bbF3A0c054402dd",
      },
      { Proxy: "1", Implementation: "" },
      {
        Proxy: "1",
        Implementation: "0x0000000000000000000000000000000000000000",
      },
    ]) {
      const fetchFn = respond(
        sourceCode({ ABI: JSON.stringify(ABI), ContractName: "X", ...fields }),
      );

      expect(
        await fetchFromEtherscan(1, ADDRESS, KEY, fetchFn),
      ).not.toHaveProperty("implementation");
    }
  });

  it("reports no verified ABI for a contract whose source is not verified", async () => {
    const fetchFn = respond(
      sourceCode({
        ABI: "Contract source code not verified",
        ContractName: "",
      }),
    );

    expect(await fetchFromEtherscan(1, ADDRESS, KEY, fetchFn)).toEqual({
      kind: "not-found",
    });
  });

  it("reports no verified ABI for an empty ABI", async () => {
    const fetchFn = respond(sourceCode({ ABI: "", ContractName: "" }));

    expect(await fetchFromEtherscan(1, ADDRESS, KEY, fetchFn)).toEqual({
      kind: "not-found",
    });
  });

  it("fails with Etherscan's explanation of an error answer", async () => {
    const fetchFn = respond({
      status: "0",
      message: "NOTOK",
      result: "Max rate limit reached",
    });

    await expect(fetchFromEtherscan(1, ADDRESS, KEY, fetchFn)).rejects.toThrow(
      /^Max rate limit reached$/,
    );
  });

  it("fails with the message of an error answer without an explanation", async () => {
    const fetchFn = respond({ status: "0", message: "Invalid API Key" });

    await expect(fetchFromEtherscan(1, ADDRESS, KEY, fetchFn)).rejects.toThrow(
      /^Invalid API Key$/,
    );
  });

  it.each([
    "Missing or unsupported chainid parameter (required for v2 api), please see https://api.etherscan.io/v2/chainlist for the list of supported chainids",
    "Free API access is not supported for this chain. Please upgrade your api plan for full chain coverage. https://etherscan.io/apis",
  ])("says the Chain is not supported on %j", async (result) => {
    const fetchFn = respond({ status: "0", message: "NOTOK", result });

    expect(await fetchFromEtherscan(31337, ADDRESS, KEY, fetchFn)).toEqual({
      kind: "unsupported-chain",
    });
  });

  it("says the Chain is not supported when only the message says so", async () => {
    const fetchFn = respond({
      status: "0",
      message: "Missing or unsupported chainid parameter",
    });

    expect(await fetchFromEtherscan(31337, ADDRESS, KEY, fetchFn)).toEqual({
      kind: "unsupported-chain",
    });
  });

  it("fails on an HTTP error", async () => {
    await expect(
      fetchFromEtherscan(1, ADDRESS, KEY, respond({}, 502)),
    ).rejects.toThrow("HTTP 502");
  });

  it("fails on an ABI that is not JSON", async () => {
    const fetchFn = respond(sourceCode({ ABI: "{oops", ContractName: "X" }));

    await expect(fetchFromEtherscan(1, ADDRESS, KEY, fetchFn)).rejects.toThrow(
      "Etherscan returned no ABI",
    );
  });

  it("fails when Etherscan does not answer in time", async () => {
    const fetchFn = vi.fn(async () => {
      throw new DOMException("signal timed out", "TimeoutError");
    });

    await expect(fetchFromEtherscan(1, ADDRESS, KEY, fetchFn)).rejects.toThrow(
      "Etherscan did not answer in 10 s",
    );
  });

  it("never puts the URL-encoded key in an error message", async () => {
    const key = "a+b/c";
    const fetchFn = respond({
      status: "0",
      message: `bad key ${encodeURIComponent(key)}`,
    });

    await expect(fetchFromEtherscan(1, ADDRESS, key, fetchFn)).rejects.toThrow(
      /^bad key …$/,
    );
  });

  it("never puts the key in an error message", async () => {
    const fetchFn = respond({ status: "0", message: `bad key ${KEY}` });

    await expect(
      fetchFromEtherscan(1, ADDRESS, KEY, fetchFn),
    ).rejects.not.toThrow(KEY);
  });
});

describe("createSerialQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs one task at a time with the interval between their starts", async () => {
    vi.useFakeTimers();
    const run = createSerialQueue(250);
    const starts: number[] = [];
    let running = 0;
    let overlapped = false;
    const task = () => async () => {
      starts.push(Date.now());
      overlapped ||= running > 0;
      running++;
      await new Promise((resolve) => setTimeout(resolve, 100));
      running--;
    };

    const done = Promise.all([run(task()), run(task()), run(task())]);
    await vi.runAllTimersAsync();
    await done;

    expect(overlapped).toBe(false);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(250);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(250);
  });

  it("waits for a slow task to finish before the next starts", async () => {
    vi.useFakeTimers();
    const run = createSerialQueue(250);
    const events: string[] = [];

    const first = run(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      events.push("first done");
    });
    const second = run(async () => {
      events.push("second started");
    });
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);

    expect(events).toEqual(["first done", "second started"]);
  });

  it("goes on after a task fails", async () => {
    vi.useFakeTimers();
    const run = createSerialQueue(250);

    const failed = run(async () => {
      throw new Error("boom");
    });
    const next = run(async () => "ok");
    const settled = Promise.allSettled([failed, next]);
    await vi.runAllTimersAsync();

    expect((await settled).map((result) => result.status)).toEqual([
      "rejected",
      "fulfilled",
    ]);
    expect(await next).toBe("ok");
  });

  it("starts the first task at once", async () => {
    vi.useFakeTimers();
    const run = createSerialQueue(250);
    const task = vi.fn(async () => {});

    void run(task);
    await vi.advanceTimersByTimeAsync(0);

    expect(task).toHaveBeenCalled();
  });
});
