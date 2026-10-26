import { describe, expect, it } from "vitest";
import { parseRpcExchange } from "./parseRpcExchange.ts";

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
