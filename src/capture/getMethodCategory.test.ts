import { describe, expect, it } from "vitest";
import { getMethodCategory } from "./getMethodCategory.ts";

describe("getMethodCategory", () => {
  it.each([
    ["eth_call", "Calls"],
    ["eth_estimateGas", "Calls"],
    ["eth_sendTransaction", "Transactions"],
    ["eth_sendRawTransaction", "Transactions"],
    ["eth_getTransactionByHash", "Transactions"],
    ["eth_getTransactionReceipt", "Transactions"],
    ["eth_getLogs", "Logs"],
    ["eth_newFilter", "Logs"],
    ["eth_newBlockFilter", "Logs"],
    ["eth_getFilterChanges", "Logs"],
    ["eth_getFilterLogs", "Logs"],
    ["eth_uninstallFilter", "Logs"],
    ["eth_blockNumber", "Chain"],
    ["eth_getBlockByNumber", "Chain"],
    ["eth_chainId", "Chain"],
    ["eth_gasPrice", "Chain"],
    ["eth_feeHistory", "Chain"],
    ["eth_getBalance", "Chain"],
    ["eth_getCode", "Chain"],
    ["eth_getStorageAt", "Chain"],
    ["eth_getTransactionCount", "Chain"],
    ["net_version", "Chain"],
    ["web3_clientVersion", "Chain"],
    ["eth_sign", "Other"],
    ["eth_signTransaction", "Other"],
    ["eth_signTypedData", "Other"],
    ["eth_signTypedData_v4", "Other"],
    ["personal_sign", "Other"],
    ["wallet_switchEthereumChain", "Other"],
    ["debug_traceTransaction", "Other"],
    ["trace_block", "Other"],
    ["anvil_mine", "Other"],
    ["hardhat_reset", "Other"],
    ["", "Other"],
  ])("puts %s into %s", (method, category) => {
    expect(getMethodCategory(method)).toBe(category);
  });
});
