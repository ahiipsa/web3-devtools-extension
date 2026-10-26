import { describe, expect, it } from "vitest";
import { Abi } from "viem";
import { buildRpcRequestRow, formatDuration } from "./rpcRequestRow.ts";
import { RpcRequest } from "../types/main.ts";
import { Contract } from "../dal/contract.ts";
import { getMethodCategory } from "../capture/getMethodCategory.ts";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

const TOKEN = "0x00000000000000000000000000000000000000aa";
// balanceOf(0x…01)
const BALANCE_OF_CALLDATA =
  "0x70a082310000000000000000000000000000000000000000000000000000000000000001";

const token: Contract = { address: TOKEN, name: "USDC", abi: erc20Abi };

const rpcRequest = (overrides: Partial<RpcRequest> = {}): RpcRequest => ({
  id: "1",
  url: "https://rpc.example:8545/v1/key?x=1",
  methodCategory: getMethodCategory("eth_call"),
  startedDateTime: "2026-01-01T00:00:00.000Z",
  time: 42.4,
  httpStatus: 200,
  hasRpcResponseBody: true,
  requestBody: {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: TOKEN, data: BALANCE_OF_CALLDATA }, "latest"],
  },
  response: { jsonrpc: "2.0", id: 1, result: "0x" },
  ...overrides,
});

const noContracts = () => undefined;

describe("buildRpcRequestRow", () => {
  it("shows the method, the Endpoint's host and the duration", () => {
    const row = buildRpcRequestRow(rpcRequest(), noContracts);

    expect(row.method).toBe("eth_call");
    expect(row.endpoint).toBe("rpc.example:8545");
    expect(row.time).toBe(42.4);
  });

  it("names the Contract when it is labelled", () => {
    const row = buildRpcRequestRow(rpcRequest(), () => token);

    expect(row.contract).toBe("USDC");
  });

  it("shortens the address of an unlabelled Contract", () => {
    const row = buildRpcRequestRow(rpcRequest(), noContracts);

    expect(row.contract).toBe("0x0000...00aa");
    expect(row.functionName).toBeUndefined();
  });

  it("has no Contract for an RPC Request that calls none", () => {
    const row = buildRpcRequestRow(
      rpcRequest({
        requestBody: { jsonrpc: "2.0", id: 1, method: "eth_blockNumber" },
      }),
      noContracts,
    );

    expect(row.contract).toBeUndefined();
    expect(row.functionName).toBeUndefined();
  });

  it("decodes the function name with the Contract's ABI", () => {
    const row = buildRpcRequestRow(rpcRequest(), () => token);

    expect(row.functionName).toBe("balanceOf");
  });

  it("has no function name when the calldata does not match the ABI", () => {
    const row = buildRpcRequestRow(
      rpcRequest({
        requestBody: {
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          // balanceOf's selector with truncated arguments
          params: [{ to: TOKEN, data: "0x70a08231" }, "latest"],
        },
      }),
      () => token,
    );

    expect(row.functionName).toBeUndefined();
  });

  it("labels the status and flags anything but ok as failed", () => {
    const ok = buildRpcRequestRow(rpcRequest(), noContracts);
    const rpcError = buildRpcRequestRow(
      rpcRequest({
        response: {
          jsonrpc: "2.0",
          id: 1,
          error: { code: 3, message: "execution reverted" },
        },
      }),
      noContracts,
    );
    const httpError = buildRpcRequestRow(
      rpcRequest({
        response: undefined,
        hasRpcResponseBody: false,
        httpStatus: 429,
      }),
      noContracts,
    );

    expect([ok.status, ok.failed]).toEqual(["ok", false]);
    expect([rpcError.status, rpcError.failed]).toEqual(["error 3", true]);
    expect([httpError.status, httpError.failed]).toEqual(["HTTP 429", true]);
  });

  it("leaves the status empty, and not failed, when nothing answered the RPC Request", () => {
    const row = buildRpcRequestRow(
      rpcRequest({ response: undefined, hasRpcResponseBody: true }),
      noContracts,
    );

    expect(row.status).toBeUndefined();
    expect(row.failed).toBe(false);
  });
});

describe("formatDuration", () => {
  it("shows milliseconds below a second and seconds above", () => {
    expect(formatDuration(42.4)).toBe("42 ms");
    expect(formatDuration(1534)).toBe("1.53 s");
  });
});
