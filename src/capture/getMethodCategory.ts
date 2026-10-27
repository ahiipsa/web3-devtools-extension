import { MethodCategory } from "../types/main.ts";

const CATEGORY_BY_METHOD: Record<string, MethodCategory> = {
  eth_call: "Calls",
  eth_estimateGas: "Calls",
  eth_sendTransaction: "Transactions",
  eth_sendRawTransaction: "Transactions",
  eth_getTransactionByHash: "Transactions",
  eth_getTransactionReceipt: "Transactions",
  eth_getTransactionByBlockHashAndIndex: "Transactions",
  eth_getTransactionByBlockNumberAndIndex: "Transactions",
  eth_getBlockReceipts: "Transactions",
  eth_getLogs: "Logs",
  eth_newFilter: "Logs",
  eth_newBlockFilter: "Logs",
  eth_newPendingTransactionFilter: "Logs",
  eth_getFilterChanges: "Logs",
  eth_getFilterLogs: "Logs",
  eth_uninstallFilter: "Logs",
  // Account methods are wallet actions, not chain reads.
  eth_accounts: "Other",
  eth_requestAccounts: "Other",
  eth_coinbase: "Other",
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
