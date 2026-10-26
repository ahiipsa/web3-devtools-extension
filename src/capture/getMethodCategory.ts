import { MethodCategory } from "../types/main.ts";

const CATEGORY_BY_METHOD: Record<string, MethodCategory> = {
  eth_call: "Calls",
  eth_estimateGas: "Calls",
  eth_sendTransaction: "Transactions",
  eth_sendRawTransaction: "Transactions",
  eth_getTransactionByHash: "Transactions",
  eth_getTransactionReceipt: "Transactions",
  eth_getLogs: "Logs",
  eth_newFilter: "Logs",
  eth_newBlockFilter: "Logs",
  eth_getFilterChanges: "Logs",
  eth_getFilterLogs: "Logs",
  eth_uninstallFilter: "Logs",
};

export function getMethodCategory(method: string): MethodCategory {
  const category = CATEGORY_BY_METHOD[method];
  if (category) {
    return category;
  }

  // Signing methods are wallet actions, not chain reads.
  if (method.startsWith("eth_sign")) {
    return "Other";
  }

  if (/^(eth|net|web3)_/.test(method)) {
    return "Chain";
  }

  return "Other";
}
