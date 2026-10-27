import { RpcRequest } from "../types/main.ts";
import { sendRpcRequest } from "./endpointRpc.ts";

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
  const result = await sendRpcRequest(endpoint, "eth_chainId", [], fetchFn);
  const chainId = parseChainId(result);
  if (chainId === undefined) {
    throw new Error("invalid eth_chainId response");
  }
  return chainId;
}
