import { RpcRequest } from "../types/main.ts";

const parseChainId = (value: unknown) =>
  typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)
    ? Number.parseInt(value, 16)
    : undefined;

// The Chain of the RPC Request's Endpoint, if it is an answered eth_chainId
export function getCapturedChainId(request: RpcRequest): number | undefined {
  return request.requestBody.method === "eth_chainId"
    ? parseChainId(request.response?.result)
    : undefined;
}

// Asks the Endpoint itself, for an Endpoint whose eth_chainId was not captured.
// Throws an Error whose message is fit to show the user
export async function requestChainId(
  endpoint: string,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: [],
    }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => undefined);
  if (body?.error?.message) {
    throw new Error(String(body.error.message));
  }
  const chainId = parseChainId(body?.result);
  if (chainId === undefined) {
    throw new Error("invalid eth_chainId response");
  }
  return chainId;
}
