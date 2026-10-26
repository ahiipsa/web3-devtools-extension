import { useEffect, useState } from "react";
import { RpcRequest } from "../types/main.ts";

let currentTabId = 0;

if (chrome && chrome.devtools) {
  currentTabId = chrome.devtools.inspectedWindow.tabId;
}

export const useRpcRequestList = () => {
  const [rpcRequests, setRpcRequests] = useState<RpcRequest[]>([]);

  useEffect(() => {
    if (!currentTabId) {
      return;
    }

    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === "loading" && tabId === currentTabId) {
        setRpcRequests([]);
      }
    });

    // Register this panel with the background script for the inspected tab
    const port = chrome.runtime.connect({ name: "devtools-page" });
    port.postMessage({ type: "init", tabId: currentTabId });

    port.onMessage.addListener((message) => {
      if (message.type === "request") {
        setRpcRequests((prev) => [...prev, message.data]);
      } else if (message.type === "extensionUpdated") {
        // Reload the panel to pick up the new extension code
        location.reload();
      }
    });
  }, []);

  return rpcRequests;
};

export const responses: Record<number, { id: number; result: object }> = {};

if (chrome && chrome.devtools.network) {
  chrome.devtools.network.onRequestFinished.addListener((request) => {
    if (
      request.request.method === "POST" &&
      request.request?.postData?.mimeType === "application/json"
    ) {
      request.getContent((content) => {
        try {
          const data = JSON.parse(content);

          const isJsonRpcResponse = typeof data?.jsonrpc !== "undefined";

          if (isJsonRpcResponse) {
            responses[data.id] = data;
          }
        } catch {
          // Not a JSON response body
        }
      });
    }
  });
}
