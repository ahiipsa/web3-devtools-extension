import { Abi, getAddress, isAddress } from "viem";

// `implementation` is set when the ABI Source marks the address as a proxy
// with one implementation
export type AbiSourceResult =
  | { kind: "found"; name: string; abi: Abi; implementation?: `0x${string}` }
  | { kind: "not-found" };

// A lowercase non-zero address, or undefined for anything else
export const parseImplementation = (
  value: unknown,
): `0x${string}` | undefined =>
  typeof value === "string" &&
  isAddress(value, { strict: false }) &&
  !/^0x0{40}$/.test(value)
    ? (value.toLowerCase() as `0x${string}`)
    : undefined;

// Only a proxy with exactly one implementation: a diamond's facets each hold
// part of its ABI
const getSourcifyImplementation = (proxyResolution: {
  isProxy?: unknown;
  implementations?: unknown;
}) =>
  proxyResolution.isProxy === true &&
  Array.isArray(proxyResolution.implementations) &&
  proxyResolution.implementations.length === 1
    ? parseImplementation(proxyResolution.implementations[0]?.address)
    : undefined;

const SOURCIFY_API = "https://sourcify.dev/server/v2/contract";

// Throws an Error whose message is fit to show the user
export async function fetchFromSourcify(
  chainId: number,
  address: `0x${string}`,
  fetchFn: typeof fetch = fetch,
): Promise<AbiSourceResult> {
  const response = await fetchFn(
    `${SOURCIFY_API}/${chainId}/${getAddress(address)}?fields=abi,compilation,proxyResolution`,
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
  const implementation = body.proxyResolution
    ? getSourcifyImplementation(body.proxyResolution)
    : undefined;
  return {
    kind: "found",
    name: typeof name === "string" ? name : "",
    abi: body.abi,
    ...(implementation && { implementation }),
  };
}
