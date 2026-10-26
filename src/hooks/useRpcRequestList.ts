import { useEffect, useState } from "react";
import { RpcRequest } from "../types/main.ts";
import { config } from "../config.ts";

let currentTabId = 0;

console.log("### config", config);

if (chrome && chrome.devtools) {
  currentTabId = chrome.devtools.inspectedWindow.tabId;
  console.log("Current inspected tab ID:", currentTabId);
}

const dummyRpcRequests: RpcRequest[] = [
  {
    id: "123",
    tabId: 1,
    url: "http://localhost:8545",
    requestBody: {
      id: 1,
      method: "eth_call",
      jsonrpc: "2.0",
      params: [
        {
          data: `0xe2bbb1580000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000442480`,
          to: "0xFEccff0ecf1cAa1669A71C5E00b51B48E4CBc6A1",
          from: "0x0000000000000000000000000000000000000000",
        },
        "latest",
      ],
    },
  },
  {
    id: "321",
    tabId: 1,
    url: "https://rpc-testnet.singularityfinance.ai/",
    requestBody: {
      id: 1,
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: ["latest", true],
    },
  },
  {
    id: "321",
    tabId: 1,
    url: "https://rpc-testnet.singularityfinance.ai/",
    requestBody: {
      id: 1,
      jsonrpc: "2.0",
      method: "eth_blockNumber",
    },
  },
  {
    id: "321",
    tabId: 1,
    url: "https://rpc-testnet.singularityfinance.ai/",
    requestBody: {
      id: 1,
      jsonrpc: "2.0",
      method: "eth_getTransactionByHash",
      params: [
        "0x9caa4aed172f86eb7399c76c2a3e7929d0b8d1b69eba521316b952879b6e9e2b",
      ],
    },
  },
  {
    id: "321",
    tabId: 1,
    url: "https://rpc-testnet.singularityfinance.ai/",
    requestBody: {
      id: 1,
      jsonrpc: "2.0",
      method: "eth_getTransactionReceipt",
      params: [
        "0x9caa4aed172f86eb7399c76c2a3e7929d0b8d1b69eba521316b952879b6e9e2b",
      ],
    },
  },
];

const initialRPCRequests = config.addDummyRPCRequests
  ? [...dummyRpcRequests]
  : [];

export const useRpcRequestList = () => {
  const [logs, setLogs] = useState<RpcRequest[]>(initialRPCRequests);

  useEffect(() => {
    if (!currentTabId) {
      return;
    }

    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === "loading" && tabId === currentTabId) {
        setLogs([]);
      }
    });

    // Устанавливаем соединение с фоновым скриптом и именуем порт (например, "devtools-page")
    const port = chrome.runtime.connect({ name: "devtools-page" });
    // При соединении отправляем информацию об инициализации, включая tabId
    port.postMessage({ type: "init", tabId: currentTabId });

    // // Загружаем сохранённые RPC-запросы
    // chrome.storage.local.get("rpcLogs", (data) => {
    //   setLogs(data.rpcLogs || []);
    // });
    port.onMessage.addListener((message) => {
      if (message.type === "request") {
        setLogs((prevLogs) => [...prevLogs, message.data]);
      } else if (message.type === "extensionUpdated") {
        console.log(`Расширение обновлено. Перезагружаем панель...`);
        // Перезагрузка панели для загрузки нового кода
        location.reload();
      }
    });
  }, []);

  return logs;
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
        } catch (error) {
          console.error("### error", error);
        }
      });
    }
  });
}
