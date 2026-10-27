import { RpcRequest } from "../types/main.ts";
import { getCapturedChainId } from "./chainId.ts";

// The Chain of one RPC Request, as the table shows it
type FailedChain = { kind: "failed"; reason: string };

export type RpcRequestChain =
  | { kind: "looking-up" }
  | { kind: "known"; chainId: number }
  // `reason` is fit to show the user
  | FailedChain;

export interface EndpointChainsDeps {
  requestChainId: (endpoint: string) => Promise<number>;
  // How long to wait for the page's own eth_chainId, which often finishes
  // after its first calls, before asking the Endpoint; 1 s by default
  lookupDelay?: number;
}

export type EndpointChains = ReturnType<typeof createEndpointChains>;

const LOOKING_UP: RpcRequestChain = { kind: "looking-up" };

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

// The Chain of every Endpoint and of every RPC Request, the one source of
// truth for the table and the ABI fetcher. All state lives in memory for one
// Panel session. A captured eth_chainId gives an Endpoint its Chain; without
// one in time the Endpoint is asked once.
export function createEndpointChains(deps: EndpointChainsDeps) {
  const chainIds = new Map<string, number>();
  // An Endpoint is asked for its chain id once automatically
  const lookups = new Map<string, Promise<number | undefined>>();
  const failures = new Map<string, FailedChain>();
  // Each RPC Request keeps the Chain its Endpoint had when it arrived
  const requestChains = new WeakMap<RpcRequest, RpcRequestChain>();
  // RPC Requests that arrived before their Endpoint's Chain was known
  const unknown = new Map<string, RpcRequest[]>();
  const seen = new WeakSet<RpcRequest>();
  const lookupDelay = deps.lookupDelay ?? 1000;

  const listeners = new Set<(endpoint: string) => void>();
  let version = 0;
  const notify = (endpoint: string) => {
    version++;
    listeners.forEach((listener) => listener(endpoint));
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
    failures.delete(endpoint);
    // The first Chain learnt is the one they were sent to
    const known: RpcRequestChain = { kind: "known", chainId };
    unknown.get(endpoint)?.forEach((request) => {
      requestChains.set(request, known);
    });
    unknown.delete(endpoint);
    notify(endpoint);
  };

  const lookUp = (endpoint: string, delay: number) => {
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
            failures.set(endpoint, {
              kind: "failed",
              reason: `no chain id from the Endpoint: ${errorMessage(error)}`,
            });
            notify(endpoint);
            return undefined;
          },
        );
      },
    );
    lookups.set(endpoint, lookup);
    if (failures.delete(endpoint)) {
      notify(endpoint);
    }
    return lookup;
  };

  // Takes in the captured RPC Requests, in the order they arrived
  const observe = (requests: RpcRequest[]) => {
    // The table may already show them, without a Chain
    const given = new Set<string>();
    for (const request of requests) {
      if (seen.has(request)) {
        continue;
      }
      seen.add(request);
      const endpoint = request.url;
      const captured = getCapturedChainId(request);
      if (captured !== undefined) {
        setChainId(endpoint, captured, true);
      }
      const chainId = chainIds.get(endpoint);
      if (chainId !== undefined) {
        requestChains.set(request, { kind: "known", chainId });
        given.add(endpoint);
        continue;
      }
      unknown.set(endpoint, [...(unknown.get(endpoint) ?? []), request]);
      if (!lookups.has(endpoint)) {
        void lookUp(endpoint, lookupDelay);
      }
    }
    given.forEach(notify);
  };

  return {
    observe,
    getChainId: (endpoint: string) => chainIds.get(endpoint),
    // Why the Endpoint has no Chain, if asking it failed
    getFailure: (endpoint: string) => failures.get(endpoint)?.reason,
    isLookingUp: (endpoint: string) =>
      !chainIds.has(endpoint) &&
      lookups.has(endpoint) &&
      !failures.has(endpoint),
    // The Endpoint's chain id, asking it right away if it has not been asked
    // or that failed; undefined if it fails
    lookUp: (endpoint: string) =>
      chainIds.has(endpoint)
        ? Promise.resolve(chainIds.get(endpoint))
        : failures.has(endpoint) || !lookups.has(endpoint)
          ? lookUp(endpoint, 0)
          : lookups.get(endpoint)!,
    // The same object until the RPC Request's Chain changes
    getRequestChain: (request: RpcRequest): RpcRequestChain =>
      requestChains.get(request) ?? failures.get(request.url) ?? LOOKING_UP,
    // Tells which Endpoint's Chain or lookup changed
    subscribe: (listener: (endpoint: string) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    // Changes whenever any state does, for useSyncExternalStore
    getVersion: () => version,
  };
}
