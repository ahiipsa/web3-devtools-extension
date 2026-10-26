import { useCallback, useEffect, useState } from "react";
import { RpcRequest } from "../types/main.ts";
import { parseRpcExchange } from "../capture/parseRpcExchange.ts";

let nextRpcRequestId = 0;

const decodeBase64Utf8 = (base64: string) => {
  try {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
};

export const useRpcRequestList = () => {
  const [rpcRequestList, setRpcRequestList] = useState<RpcRequest[]>([]);

  useEffect(() => {
    const network =
      typeof chrome === "undefined" ? undefined : chrome.devtools?.network;
    if (!network) {
      return;
    }

    const onRequestFinished = (entry: chrome.devtools.network.Request) => {
      const requestText = entry.request.postData?.text;
      if (
        entry.request.method !== "POST" ||
        !requestText ||
        parseRpcExchange(requestText, "").length === 0
      ) {
        return;
      }

      entry.getContent((content, encoding) => {
        const responseText =
          encoding === "base64" ? decodeBase64Utf8(content) : (content ?? "");
        const captured = parseRpcExchange(requestText, responseText).map(
          (exchange) => ({
            ...exchange,
            id: String(++nextRpcRequestId),
            url: entry.request.url,
          }),
        );
        setRpcRequestList((prev) => [...prev, ...captured]);
      });
    };

    const onNavigated = () => setRpcRequestList([]);

    network.onRequestFinished.addListener(onRequestFinished);
    network.onNavigated.addListener(onNavigated);
    return () => {
      network.onRequestFinished.removeListener(onRequestFinished);
      network.onNavigated.removeListener(onNavigated);
    };
  }, []);

  const clearRpcRequestList = useCallback(() => setRpcRequestList([]), []);

  return { rpcRequestList, clearRpcRequestList };
};
