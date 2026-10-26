import { RpcRequest } from "./types/main.ts";

const methods = [
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_call",
  "eth_sendTransaction",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_estimateGas",
];

// Open DevTools panel ports, keyed by inspected tabId
const devtoolsPorts: Record<number, chrome.runtime.Port> = {};

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "devtools-page") {
    port.onMessage.addListener((msg) => {
      if (msg.type === "init" && msg.tabId !== undefined) {
        devtoolsPorts[msg.tabId] = port;
      }
    });

    port.onDisconnect.addListener(() => {
      for (const tab in devtoolsPorts) {
        if (devtoolsPorts[tab] === port) {
          delete devtoolsPorts[tab];
          break;
        }
      }
    });
  }
});

const decoder = new TextDecoder("utf-8");

chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    if (details.method === "POST" && details.requestBody) {
      if (!details.requestBody.raw) {
        return;
      }

      if (!details.tabId || !devtoolsPorts[details.tabId]) {
        return;
      }

      try {
        const requestBody = decoder.decode(details.requestBody.raw[0].bytes);
        const requestData = JSON.parse(requestBody);

        const data: RpcRequest = {
          id: details.requestId,
          tabId: details.tabId,
          url: details.url,
          requestBody: {
            ...requestData,
          },
        };

        if (methods.includes(requestData.method)) {
          devtoolsPorts[details.tabId].postMessage({ type: "request", data });

          chrome.storage.local.get("rpcLogs", (data) => {
            const logs = data.rpcLogs || [];
            logs.push(data);

            chrome.storage.local.set({ rpcLogs: logs });
          });
        }
      } catch {
        // Not a JSON-RPC body
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"],
);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    const newVersion = chrome.runtime.getManifest().version;
    // Tell open panels to reload with the new code
    for (const tabId in devtoolsPorts) {
      const port = devtoolsPorts[tabId];
      port.postMessage({ type: "extensionUpdated", newVersion });
    }
  }
});
