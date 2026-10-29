import { RpcRequest } from "../types/main.ts";
import { Contract, normalizeAddress } from "../dal/contract.ts";
import { getContractCallParams } from "../utils/requestUtils.ts";
import { errorMessage } from "../utils/text.ts";
import { formatShortAddress } from "../details/formatAddress.ts";
import { getInnerCallTargets } from "../decoding/multicall.ts";
import { EndpointChains } from "../chains/endpointChains.ts";
import { AbiSourceName, AbiSourceOutcomes, ContractAbi } from "./abiSources.ts";

// What the Contract tab shows for an address without a Contract: a miss
// keeps what each ABI Source answered; "failed" is a failure outside them,
// such as an unknown Chain
export type AbiFetchState =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "missed"; outcomes: AbiSourceOutcomes }
  | { kind: "failed"; reason: string };

export interface AbiFetcherDeps {
  getContract: (address: `0x${string}`) => Promise<Contract | null>;
  saveFetchedContract: (
    contract: Contract & { source: AbiSourceName },
  ) => Promise<boolean>;
  // The Endpoint the address was called on, to read a proxy's
  // implementation from
  fetchAbi: (
    chainId: number,
    address: `0x${string}`,
    endpoint: string,
  ) => Promise<ContractAbi>;
  // The Endpoints' Chains, shared with the table; the Panel observes the RPC
  // Requests there before it calls `observe` here
  chains: EndpointChains;
  // How long the Etherscan API key must stay unchanged before misses are
  // fetched again; it is saved as typed, one write per keystroke
  etherscanApiKeyDelay?: number;
}

export type AbiFetcher = ReturnType<typeof createAbiFetcher>;

// One Multicall can name 10–20 targets; Etherscan keeps its own serialisation
const MAX_FETCHES_AT_ONCE = 4;

// Runs at most `limit` tasks at once; the rest start in order as others
// settle, a task queued `first` ahead of the others
const createConcurrencyLimit = (limit: number) => {
  let running = 0;
  const queued: (() => void)[] = [];
  return async <T>(task: () => Promise<T>, first = false): Promise<T> => {
    if (running < limit) {
      running++;
    } else {
      // A settling task hands its slot over, so no new task can take it first
      await new Promise<void>((start) =>
        first ? queued.unshift(start) : queued.push(start),
      );
    }
    try {
      return await task();
    } finally {
      const next = queued.shift();
      if (next) {
        next();
      } else {
        running--;
      }
    }
  };
};

const IDLE: AbiFetchState = { kind: "idle" };

// Etherscan answers a new key could change
const ETHERSCAN_KEY_OUTCOMES = new Set<AbiSourceOutcomes["etherscan"]["kind"]>([
  "not-asked",
  "paid-plan",
  "invalid-key",
  "rate-limit",
  "failed",
]);

// An attempt an Etherscan API key could change: Etherscan was not asked,
// needs a paid plan, rejected the key or its rate, or failed; or Sourcify
// failed, so Etherscan's ABI is all there is to find
const mayFindWithKey = (state: AbiFetchState | undefined) =>
  state?.kind === "failed" ||
  (state?.kind === "missed" &&
    (state.outcomes.sourcify.kind === "failed" ||
      ETHERSCAN_KEY_OUTCOMES.has(state.outcomes.etherscan.kind)));

// Fetches the ABIs of called addresses without a Contract and saves them as
// Contracts. All state lives in memory for one Panel session: one automatic
// attempt per (Chain, address), and one more for those an Etherscan API key
// set since could change.
export function createAbiFetcher(deps: AbiFetcherDeps) {
  const { chains } = deps;
  const etherscanApiKeyDelay = deps.etherscanApiKeyDelay ?? 1000;
  // Addresses called on an Endpoint whose Chain is not known yet
  const waiting = new Map<string, Set<`0x${string}`>>();
  // By `${chainId}:${address}`; present once an attempt was made
  const attempts = new Map<string, AbiFetchState>();
  // The Endpoint of each attempt's latest fetch, to fetch again on
  const attemptEndpoints = new Map<string, string>();
  const seen = new WeakSet<RpcRequest>();
  // Shared by automatic and manual fetches, so across the whole Panel
  const limitFetches = createConcurrencyLimit(MAX_FETCHES_AT_ONCE);
  let automatic = false;
  // Undefined until the Panel passes the key it starts with
  let etherscanApiKey: string | undefined;
  // The key misses were last fetched with: the one the Panel starts with,
  // the last one re-fetched for, or none once cleared
  let settledEtherscanApiKey = "";
  let etherscanApiKeyTimer: ReturnType<typeof setTimeout> | undefined;
  // Counts the re-fetches for a new key; a fetch that started before one
  // may have missed the key, so it is fetched again when it ends
  let etherscanApiKeyRound = 0;

  const listeners = new Set<() => void>();
  let version = 0;
  const notify = () => {
    version++;
    listeners.forEach((listener) => listener());
  };

  const attemptKey = (chainId: number, address: `0x${string}`) =>
    `${chainId}:${address}`;

  const setAttempt = (key: string, state: AbiFetchState) => {
    attempts.set(key, state);
    notify();
  };

  // `manual`: the user is waiting, so it goes ahead of queued fetches
  const fetchAbi = async (
    chainId: number,
    address: `0x${string}`,
    endpoint: string,
    manual = false,
  ) => {
    const key = attemptKey(chainId, address);
    setAttempt(key, { kind: "fetching" });
    attemptEndpoints.set(key, endpoint);
    let round = etherscanApiKeyRound;
    try {
      // Queued fetches stay "fetching"; a Contract saved meanwhile ends one
      const result = await limitFetches(async () => {
        round = etherscanApiKeyRound;
        return (await deps.getContract(address))
          ? undefined
          : deps.fetchAbi(chainId, address, endpoint);
      }, manual);
      if (!result) {
        setAttempt(key, IDLE);
        return;
      }
      if (result.kind === "missed") {
        setAttempt(key, result);
        return;
      }
      await deps.saveFetchedContract({
        address,
        name: result.name || formatShortAddress(address),
        abi: result.abi,
        source: result.source,
        ...(result.proxy && { proxy: result.proxy }),
      });
      setAttempt(key, IDLE);
    } catch (error) {
      setAttempt(key, { kind: "failed", reason: errorMessage(error) });
    } finally {
      if (
        round !== etherscanApiKeyRound &&
        automatic &&
        chains.getChainId(endpoint) === chainId &&
        mayFindWithKey(attempts.get(key))
      ) {
        void fetchAbi(chainId, address, endpoint);
      }
    }
  };

  // Fetches again, as automatically, every attempt the new key could change
  const refetchForEtherscanApiKey = () => {
    etherscanApiKeyTimer = undefined;
    settledEtherscanApiKey = etherscanApiKey ?? "";
    if (!automatic) {
      return;
    }
    etherscanApiKeyRound++;
    for (const [key, state] of attempts) {
      const endpoint = attemptEndpoints.get(key);
      const [chainId, address] = key.split(":");
      // An Endpoint since switched to another Chain would read a proxy's
      // implementation there
      if (
        endpoint &&
        chains.getChainId(endpoint) === Number(chainId) &&
        mayFindWithKey(state)
      ) {
        void fetchAbi(Number(chainId), address as `0x${string}`, endpoint);
      }
    }
  };

  // The Etherscan API key in the settings, each time it changes; the first
  // call passes the key the Panel starts with. An edit that ends on the key
  // misses were last fetched with fetches nothing.
  const setEtherscanApiKey = (value: string) => {
    const apiKey = value.trim();
    if (etherscanApiKey === undefined) {
      etherscanApiKey = settledEtherscanApiKey = apiKey;
      return;
    }
    etherscanApiKey = apiKey;
    clearTimeout(etherscanApiKeyTimer);
    etherscanApiKeyTimer = undefined;
    if (!apiKey) {
      settledEtherscanApiKey = "";
    } else if (apiKey !== settledEtherscanApiKey) {
      etherscanApiKeyTimer = setTimeout(
        refetchForEtherscanApiKey,
        etherscanApiKeyDelay,
      );
    }
  };

  const fetchAutomatically = (
    chainId: number,
    address: `0x${string}`,
    endpoint: string,
  ) => {
    if (!attempts.has(attemptKey(chainId, address))) {
      void fetchAbi(chainId, address, endpoint);
    }
  };

  // Each Chain an Endpoint gets, the first or a captured switch, fetches
  // what was called there while it was not known
  chains.subscribe((endpoint) => {
    const chainId = chains.getChainId(endpoint);
    if (chainId !== undefined) {
      const addresses = waiting.get(endpoint);
      waiting.delete(endpoint);
      if (automatic) {
        addresses?.forEach((address) =>
          fetchAutomatically(chainId, address, endpoint),
        );
      }
    }
    notify();
  });

  const addWaiting = (endpoint: string, address: `0x${string}`) => {
    const addresses = waiting.get(endpoint) ?? new Set();
    addresses.add(address);
    waiting.set(endpoint, addresses);
  };

  // Takes in the captured RPC Requests; with `automaticFetch`, fetches the ABI
  // of every called address without a Contract, Inner Call targets included
  const observe = (requests: RpcRequest[], automaticFetch: boolean) => {
    automatic = automaticFetch;
    if (!automatic) {
      return;
    }

    for (const request of requests) {
      if (seen.has(request)) {
        continue;
      }
      seen.add(request);
      const to = getContractCallParams(request)?.to;
      if (!to) {
        continue;
      }
      // A Multicall's Inner Call targets are called contracts too (ADR 0002)
      const addresses = new Set(
        [to, ...(getInnerCallTargets(request) ?? [])].map(normalizeAddress),
      );
      const chainId = chains.getChainId(request.url);
      if (chainId !== undefined) {
        addresses.forEach((address) =>
          fetchAutomatically(chainId, address, request.url),
        );
        continue;
      }
      addresses.forEach((address) => addWaiting(request.url, address));
    }
  };

  // The "Fetch ABI" button: retries whatever happened before, and asks the
  // Endpoint for its chain id again if that failed
  const fetchManually = async (endpoint: string, to: `0x${string}`) => {
    const address = normalizeAddress(to);
    let chainId = chains.getChainId(endpoint);
    if (chainId === undefined) {
      addWaiting(endpoint, address);
      chainId = await chains.lookUp(endpoint);
      if (chainId === undefined) {
        return;
      }
    }
    if (attempts.get(attemptKey(chainId, address))?.kind !== "fetching") {
      await fetchAbi(chainId, address, endpoint, true);
    }
  };

  const getState = (endpoint: string, to: `0x${string}`): AbiFetchState => {
    const address = normalizeAddress(to);
    const chainId = chains.getChainId(endpoint);
    if (chainId !== undefined) {
      return attempts.get(attemptKey(chainId, address)) ?? IDLE;
    }
    if (!waiting.get(endpoint)?.has(address)) {
      return IDLE;
    }
    const failure = chains.getFailure(endpoint);
    if (failure !== undefined) {
      return { kind: "failed", reason: failure };
    }
    return chains.isLookingUp(endpoint) ? { kind: "fetching" } : IDLE;
  };

  return {
    observe,
    fetchManually,
    setEtherscanApiKey,
    getState,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // Changes whenever any state does, for useSyncExternalStore
    getVersion: () => version,
  };
}
