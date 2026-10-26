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

// Объект для хранения соединений с DevTools-окном по tabId
const devtoolsPorts: Record<number, chrome.runtime.Port> = {};

// Слушаем установку соединения от любых компонентов расширения
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "devtools-page") {
    // Ожидаем сообщение инициализации от окна DevTools
    port.onMessage.addListener((msg) => {
      if (msg.type === "init" && msg.tabId !== undefined) {
        // Сохраняем порт, привязанный к конкретному tabId
        devtoolsPorts[msg.tabId] = port;
        console.log("DevTools подключён для tabId:", msg.tabId);
      }
    });

    // Обработка отключения окна DevTools
    port.onDisconnect.addListener(() => {
      // Найдем и удалим порт, соответствующий отключившейся вкладке
      for (const tab in devtoolsPorts) {
        if (devtoolsPorts[tab] === port) {
          console.log("DevTools отключён для tabId:", tab);
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
      } catch (error) {
        console.log("### error", error);
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"],
);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "update") {
    const newVersion = chrome.runtime.getManifest().version;
    console.log("Расширение обновлено до версии:", newVersion);

    // Уведомляем все активные DevTools панели об обновлении
    for (const tabId in devtoolsPorts) {
      const port = devtoolsPorts[tabId];
      port.postMessage({ type: "extensionUpdated", newVersion });
    }
  }
});
