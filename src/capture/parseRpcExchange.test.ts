import { describe, expect, it } from "vitest";
import { hasRpcResponseBody, parseRpcExchange } from "./parseRpcExchange.ts";

describe("parseRpcExchange", () => {
  it("pairs a single RPC Request with its RPC Response", () => {
    const exchanges = parseRpcExchange(
      '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}',
      '{"jsonrpc":"2.0","id":1,"result":"0x10"}',
    );

    expect(exchanges).toEqual([
      {
        requestBody: {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_blockNumber",
          params: [],
        },
        response: { jsonrpc: "2.0", id: 1, result: "0x10" },
      },
    ]);
  });

  it("splits a batch into RPC Requests paired by id, regardless of response order", () => {
    const exchanges = parseRpcExchange(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
      JSON.stringify([
        { jsonrpc: "2.0", id: 2, result: "0x10" },
        { jsonrpc: "2.0", id: 1, result: "0x1" },
      ]),
    );

    expect(exchanges).toEqual([
      {
        requestBody: { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        response: { jsonrpc: "2.0", id: 1, result: "0x1" },
      },
      {
        requestBody: { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
        response: { jsonrpc: "2.0", id: 2, result: "0x10" },
      },
    ]);
  });

  it("leaves an RPC Request unpaired when its batch response omits it", () => {
    const exchanges = parseRpcExchange(
      JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
      ]),
      '[{"jsonrpc":"2.0","id":2,"result":"0x10"}]',
    );

    expect(exchanges).toEqual([
      { requestBody: { jsonrpc: "2.0", id: 1, method: "eth_chainId" } },
      {
        requestBody: { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
        response: { jsonrpc: "2.0", id: 2, result: "0x10" },
      },
    ]);
  });

  it.each([
    ["a non-JSON body", "a=1&b=2"],
    ["a JSON body that is not JSON-RPC", '{"query":"{ viewer { id } }"}'],
    ["a JSON-RPC body without a method", '{"jsonrpc":"2.0","id":1}'],
    ["an empty body", ""],
  ])("ignores a request with %s", (_label, requestText) => {
    expect(parseRpcExchange(requestText, "")).toEqual([]);
  });

  it.each([
    ["is empty (failed request)", ""],
    ["is not JSON", "<html>502 Bad Gateway</html>"],
    ["is a JSON null", "null"],
    ["has a different id", '{"jsonrpc":"2.0","id":99,"result":"0x1"}'],
  ])(
    "keeps the RPC Request without an RPC Response when the response %s",
    (_label, responseText) => {
      expect(
        parseRpcExchange(
          '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}',
          responseText,
        ),
      ).toEqual([
        { requestBody: { jsonrpc: "2.0", id: 1, method: "eth_chainId" } },
      ]);
    },
  );
});

describe("hasRpcResponseBody", () => {
  it.each([
    ["a single RPC Response", '{"jsonrpc":"2.0","id":1,"result":"0x1"}'],
    ["a batch of RPC Responses", '[{"jsonrpc":"2.0","id":2,"result":"0x1"}]'],
    [
      "an RPC Response with an error",
      '{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"x"}}',
    ],
  ])("is true for %s", (_label, responseText) => {
    expect(hasRpcResponseBody(responseText)).toBe(true);
  });

  it.each([
    ["an empty body", ""],
    ["an HTML error page", "<html>502 Bad Gateway</html>"],
    ["a JSON body that is not JSON-RPC", '{"message":"Too Many Requests"}'],
    ["an empty batch", "[]"],
  ])("is false for %s", (_label, responseText) => {
    expect(hasRpcResponseBody(responseText)).toBe(false);
  });
});
