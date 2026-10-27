import { Abi } from "viem";
import { AbiSourceResult } from "./sourcify.ts";

const ETHERSCAN_API = "https://api.etherscan.io/v2/api";

// Free API keys allow 5 requests per second
export const ETHERSCAN_REQUEST_INTERVAL = 250;

// Requests run one at a time, so a stalled one must not block the rest
export const ETHERSCAN_TIMEOUT = 10_000;

const NOT_VERIFIED = "Contract source code not verified";

// Throws an Error whose message is fit to show the user; it never contains
// the key
export async function fetchFromEtherscan(
  chainId: number,
  address: `0x${string}`,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<AbiSourceResult> {
  const encodedKey = encodeURIComponent(apiKey);
  const fail = (message: string) =>
    new Error(
      apiKey
        ? message.split(apiKey).join("…").split(encodedKey).join("…")
        : message,
    );

  let response: Response;
  try {
    response = await fetchFn(
      `${ETHERSCAN_API}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${encodedKey}`,
      { signal: AbortSignal.timeout(ETHERSCAN_TIMEOUT) },
    );
  } catch (error) {
    throw fail(
      error instanceof Error && error.name === "TimeoutError"
        ? `Etherscan did not answer in ${ETHERSCAN_TIMEOUT / 1000} s`
        : error instanceof Error
          ? error.message
          : String(error),
    );
  }
  if (!response.ok) {
    throw fail(`HTTP ${response.status}`);
  }

  const body = await response.json().catch(() => undefined);
  if (body?.status !== "1") {
    // The explanation is in `result`; `message` is often just "NOTOK"
    const reason =
      typeof body?.result === "string" && body.result
        ? body.result
        : body?.message;
    throw fail(
      typeof reason === "string" && reason
        ? reason
        : "Etherscan returned no ABI",
    );
  }

  const first = Array.isArray(body.result) ? body.result[0] : undefined;
  const abiJson = first?.ABI;
  if (abiJson === undefined || abiJson === "" || abiJson === NOT_VERIFIED) {
    return { kind: "not-found" };
  }
  let abi: unknown;
  try {
    abi = JSON.parse(abiJson);
  } catch {
    abi = undefined;
  }
  if (!Array.isArray(abi)) {
    throw fail("Etherscan returned no ABI");
  }
  if (abi.length === 0) {
    return { kind: "not-found" };
  }
  const name = first.ContractName;
  return {
    kind: "found",
    name: typeof name === "string" ? name : "",
    abi: abi as Abi,
  };
}

// Runs tasks one at a time, starting each at least `interval` ms after the
// previous one started
export function createSerialQueue(interval: number) {
  let last: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;

  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = last
      .catch(() => {})
      .then(async () => {
        const wait = lastStart + interval - Date.now();
        if (wait > 0) {
          await new Promise((resolve) => setTimeout(resolve, wait));
        }
        lastStart = Date.now();
        return task();
      });
    last = result;
    return result;
  };
}
