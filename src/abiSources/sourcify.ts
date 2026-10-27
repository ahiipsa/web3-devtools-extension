import { Abi, getAddress } from "viem";

export type AbiSourceResult =
  | { kind: "found"; name: string; abi: Abi }
  | { kind: "not-found" };

const SOURCIFY_API = "https://sourcify.dev/server/v2/contract";

// Throws an Error whose message is fit to show the user
export async function fetchFromSourcify(
  chainId: number,
  address: `0x${string}`,
  fetchFn: typeof fetch = fetch,
): Promise<AbiSourceResult> {
  const response = await fetchFn(
    `${SOURCIFY_API}/${chainId}/${getAddress(address)}?fields=abi,compilation`,
  );
  if (response.status === 404) {
    return { kind: "not-found" };
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => undefined);
  if (!Array.isArray(body?.abi)) {
    throw new Error("Sourcify returned no ABI");
  }
  const name = body.compilation?.name;
  return {
    kind: "found",
    name: typeof name === "string" ? name : "",
    abi: body.abi,
  };
}
