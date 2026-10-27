// Sends one RPC Request of the Panel's own to an Endpoint and resolves to its
// result. Throws an Error whose message is fit to show the user
export async function sendRpcRequest(
  endpoint: string,
  method: string,
  params: unknown[],
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => undefined);
  if (body?.error?.message) {
    throw new Error(String(body.error.message));
  }
  return body?.result;
}
