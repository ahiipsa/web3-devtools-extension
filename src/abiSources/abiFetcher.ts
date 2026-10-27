import { RpcRequest } from "../types/main.ts";
import { Contract, normalizeAddress } from "../dal/contract.ts";
import { getContractCallParams } from "../utils/requestUtils.ts";
import { trimContractAddress } from "../utils/text.ts";
import { getInnerCallTargets } from "../decoding/multicall.ts";
import { EndpointChains } from "../chains/endpointChains.ts";
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
  // The Endpoints' Chains, shared with the table; the Panel observes the RPC
  // Requests there before it calls `observe` here
  chains: EndpointChains;
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
// Contracts. All state lives in memory for one Panel session: one automatic
// attempt per (Chain, address).
export function createAbiFetcher(deps: AbiFetcherDeps) {
  const { chains } = deps;
  // Addresses called on an Endpoint whose Chain is not known yet
  const waiting = new Map<string, Set<`0x${string}`>>();
  // By `${chainId}:${address}`; present once an attempt was made
  const attempts = new Map<string, AbiFetchState>();
  const seen = new WeakSet<RpcRequest>();
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
