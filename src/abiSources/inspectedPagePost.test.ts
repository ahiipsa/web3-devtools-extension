import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postFromInspectedPage } from "./inspectedPagePost.ts";

const ENDPOINT = "https://proxy.example/rpc/1";
const BODY =
  '{"jsonrpc":"2.0","id":"evm-rpc-inspector:1","method":"eth_chainId"}';

// inspectedWindow.eval running the expression in this realm, standing in for
// the inspected page; `fails` makes DevTools refuse it
const installInspectedWindow = (fails = false) => {
  const evalInPage = vi.fn(
    (
      expression: string,
      callback: (
        result: unknown,
        exceptionInfo?: Partial<chrome.devtools.inspectedWindow.EvaluationExceptionInfo>,
      ) => void,
    ) => {
      if (fails) {
        return callback(undefined, {
          isError: true,
          description: "Cannot access a chrome:// URL",
        });
      }
      try {
        // A structured clone, as eval hands the Panel a JSON copy
        callback(structuredClone((0, eval)(expression)));
      } catch (error) {
        callback(undefined, { isException: true, value: String(error) });
      }
    },
  );
  vi.stubGlobal("chrome", {
    devtools: { inspectedWindow: { eval: evalInPage } },
  });
  return evalInPage;
};

beforeEach(() => {
  vi.stubGlobal("window", globalThis);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postFromInspectedPage", () => {
  it("posts the body from the page and hands back its HTTP answer", async () => {
    installInspectedWindow();
    const pageFetch = vi.fn(
      async () =>
        new Response('{"jsonrpc":"2.0","result":"0x1"}', { status: 200 }),
    );
    vi.stubGlobal("fetch", pageFetch);

    expect(await postFromInspectedPage(ENDPOINT, BODY, 10_000)).toEqual({
      status: 200,
      text: '{"jsonrpc":"2.0","result":"0x1"}',
    });
    const [url, init] = pageFetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(ENDPOINT);
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: BODY,
      credentials: "omit",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("hands back an HTTP error as an answer", async () => {
    installInspectedWindow();
    vi.stubGlobal("fetch", async () => new Response("no", { status: 502 }));

    expect(await postFromInspectedPage(ENDPOINT, BODY, 10_000)).toEqual({
      status: 502,
      text: "no",
    });
  });

  it("fails with the page's network error", async () => {
    installInspectedWindow();
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(postFromInspectedPage(ENDPOINT, BODY, 10_000)).rejects.toThrow(
      "Failed to fetch",
    );
  });

  it("fails with a TimeoutError when the page's fetch times out", async () => {
    installInspectedWindow();
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("signal timed out", "TimeoutError");
    });

    await expect(
      postFromInspectedPage(ENDPOINT, BODY, 10_000),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("waits for a fetch still running in the page", async () => {
    installInspectedWindow();
    vi.stubGlobal(
      "fetch",
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(new Response("late")), 250),
        ),
    );

    expect(await postFromInspectedPage(ENDPOINT, BODY, 10_000)).toEqual({
      status: 200,
      text: "late",
    });
  });

  it("fails when the page navigates away before the answer", async () => {
    installInspectedWindow();
    vi.stubGlobal("fetch", () => {
      // The navigation drops the page's globals
      setTimeout(() => {
        delete (globalThis as Record<string, unknown>).__evmRpcInspectorPosts;
      }, 0);
      return new Promise(() => {});
    });

    await expect(postFromInspectedPage(ENDPOINT, BODY, 10_000)).rejects.toThrow(
      "the inspected page navigated away",
    );
  });

  it("never takes the outcome of a post from an earlier Panel session", async () => {
    installInspectedWindow();
    vi.stubGlobal("fetch", async () => new Response("this session"));
    // A post the page finished after an earlier Panel closed
    (globalThis as Record<string, unknown>).__evmRpcInspectorPosts = {
      1: { done: true, status: 200, text: "an earlier session" },
    };

    expect(await postFromInspectedPage(ENDPOINT, BODY, 10_000)).toEqual({
      status: 200,
      text: "this session",
    });
  });

  it("fails when DevTools cannot evaluate in the page", async () => {
    installInspectedWindow(true);

    await expect(postFromInspectedPage(ENDPOINT, BODY, 10_000)).rejects.toThrow(
      "Cannot access a chrome:// URL",
    );
  });

  it("fails outside DevTools", async () => {
    vi.stubGlobal("chrome", undefined);

    await expect(postFromInspectedPage(ENDPOINT, BODY, 10_000)).rejects.toThrow(
      "there is no inspected page",
    );
  });
});
