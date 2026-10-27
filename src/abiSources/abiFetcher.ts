import { RpcRequest } from "../types/main.ts";
import { Contract, normalizeAddress } from "../dal/contract.ts";
import { getContractCallParams } from "../utils/requestUtils.ts";
import { trimContractAddress } from "../utils/text.ts";
import { getInnerCallTargets } from "../decoding/multicall.ts";
import { getCapturedChainId } from "./chainId.ts";
import { AbiSourceName, ContractAbi } from "./abiSources.ts";

// What the Contract tab shows for an address without a Contract
export type AbiFetchState =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "not-found"; sources: AbiSourceName[] }
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
  requestChainId: (endpoint: string) => Promise<number>;
  // How long to wait for the page's own eth_chainId, which often finishes
  // after its first calls, before asking the Endpoint; 1 s by default
  chainLookupDelay?: number;
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

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// Fetches the ABIs of called addresses without a Contract and saves them as
// Contracts. All state lives in memory for one Panel session: the Chain of
// each Endpoint, and one automatic attempt per (Chain, address).
export function createAbiFetcher(deps: AbiFetcherDeps) {
  const chainIds = new Map<string, number>();
  // An Endpoint is asked for its chain id once automatically
  const chainLookups = new Map<string, Promise<number | undefined>>();
  const chainErrors = new Map<string, string>();
  // Addresses called on an Endpoint whose Chain is not known yet
  const waiting = new Map<string, Set<`0x${string}`>>();
  // By `${chainId}:${address}`; present once an attempt was made
  const attempts = new Map<string, AbiFetchState>();
  const seenForChain = new WeakSet<RpcRequest>();
  const seenForFetch = new WeakSet<RpcRequest>();
  const chainLookupDelay = deps.chainLookupDelay ?? 1000;
  // Shared by automatic and manual fetches, so across the whole Panel
  const limitFetches = createConcurrencyLimit(MAX_FETCHES_AT_ONCE);
  let automatic = false;

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
    try {
      // Queued fetches stay "fetching"; a Contract saved meanwhile ends one
      const result = await limitFetches(
        async () =>
          (await deps.getContract(address))
            ? undefined
            : deps.fetchAbi(chainId, address, endpoint),
        manual,
      );
      if (!result) {
        setAttempt(key, IDLE);
        return;
      }
      if (result.kind === "not-found") {
        setAttempt(key, result);
        return;
      }
      await deps.saveFetchedContract({
        address,
        name: result.name || trimContractAddress(address),
        abi: result.abi,
        source: result.source,
        ...(result.proxy && { proxy: result.proxy }),
      });
      setAttempt(key, IDLE);
    } catch (error) {
      setAttempt(key, { kind: "failed", reason: errorMessage(error) });
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

  // A captured eth_chainId always wins: the Endpoint may now serve another
  // Chain, e.g. a restarted local fork
  const setChainId = (endpoint: string, chainId: number, captured: boolean) => {
    if (
      chainIds.get(endpoint) === chainId ||
      (!captured && chainIds.has(endpoint))
    ) {
      return;
    }
    chainIds.set(endpoint, chainId);
    chainErrors.delete(endpoint);
    const addresses = waiting.get(endpoint);
    waiting.delete(endpoint);
    if (automatic) {
      addresses?.forEach((address) =>
        fetchAutomatically(chainId, address, endpoint),
      );
    }
    notify();
  };

  const lookUpChainId = (endpoint: string, delay: number) => {
    const lookup = new Promise((resolve) => setTimeout(resolve, delay)).then(
      () => {
        const captured = chainIds.get(endpoint);
        if (captured !== undefined) {
          return captured;
        }
        return deps.requestChainId(endpoint).then(
          (chainId) => {
            setChainId(endpoint, chainId, false);
            return chainIds.get(endpoint);
          },
          (error) => {
            chainErrors.set(endpoint, errorMessage(error));
            notify();
            return undefined;
          },
        );
      },
    );
    chainLookups.set(endpoint, lookup);
    chainErrors.delete(endpoint);
    notify();
    return lookup;
  };

  const addWaiting = (endpoint: string, address: `0x${string}`) => {
    const addresses = waiting.get(endpoint) ?? new Set();
    addresses.add(address);
    waiting.set(endpoint, addresses);
  };

  // Takes in the captured RPC Requests; with `automaticFetch`, fetches the ABI
  // of every called address without a Contract, Inner Call targets included
  const observe = (requests: RpcRequest[], automaticFetch: boolean) => {
    automatic = automaticFetch;
    for (const request of requests) {
      if (seenForChain.has(request)) {
        continue;
      }
      seenForChain.add(request);
      const chainId = getCapturedChainId(request);
      if (chainId !== undefined) {
        setChainId(request.url, chainId, true);
      }
    }
    if (!automatic) {
      return;
    }

    for (const request of requests) {
      if (seenForFetch.has(request)) {
        continue;
      }
      seenForFetch.add(request);
      const to = getContractCallParams(request)?.to;
      if (!to) {
        continue;
      }
      // A Multicall's Inner Call targets are called contracts too (ADR 0002)
      const addresses = new Set(
        [to, ...(getInnerCallTargets(request) ?? [])].map(normalizeAddress),
      );
      const chainId = chainIds.get(request.url);
      if (chainId !== undefined) {
        addresses.forEach((address) =>
          fetchAutomatically(chainId, address, request.url),
        );
        continue;
      }
      addresses.forEach((address) => addWaiting(request.url, address));
      if (!chainLookups.has(request.url)) {
        void lookUpChainId(request.url, chainLookupDelay);
      }
    }
  };

  // The "Fetch ABI" button: retries whatever happened before, and asks the
  // Endpoint for its chain id again if that failed
  const fetchManually = async (endpoint: string, to: `0x${string}`) => {
    const address = normalizeAddress(to);
    let chainId = chainIds.get(endpoint);
    if (chainId === undefined) {
      addWaiting(endpoint, address);
      chainId = await (chainErrors.has(endpoint) || !chainLookups.has(endpoint)
        ? lookUpChainId(endpoint, 0)
        : chainLookups.get(endpoint));
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
    const chainId = chainIds.get(endpoint);
    if (chainId !== undefined) {
      return attempts.get(attemptKey(chainId, address)) ?? IDLE;
    }
    if (!waiting.get(endpoint)?.has(address)) {
      return IDLE;
    }
    const chainError = chainErrors.get(endpoint);
    if (chainError !== undefined) {
      return {
        kind: "failed",
        reason: `no chain id from the Endpoint: ${chainError}`,
      };
    }
    return chainLookups.has(endpoint) ? { kind: "fetching" } : IDLE;
  };

  return {
    observe,
    fetchManually,
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
