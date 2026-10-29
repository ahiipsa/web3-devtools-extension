import { nextOwnRpcRequestId } from "../capture/ownRpcRequestId.ts";
import {
  EndpointHttpResponse,
  postFromInspectedPage,
} from "./inspectedPagePost.ts";

// A stalled Endpoint must not keep a fetch going for ever
export const ENDPOINT_TIMEOUT = 10_000;

// How the Panel's own RPC Requests reach an Endpoint
export interface EndpointTransport {
  // From the Panel
  fetch: typeof fetch;
  // From the inspected page, for an Endpoint the Panel cannot reach
  postFromPage: (
    endpoint: string,
    body: string,
    timeout: number,
  ) => Promise<EndpointHttpResponse>;
}

export const DEFAULT_ENDPOINT_TRANSPORT: EndpointTransport = {
  fetch: (input, init) => fetch(input, init),
  postFromPage: postFromInspectedPage,
};

const toUserError = (error: unknown) =>
  error instanceof Error && error.name === "TimeoutError"
    ? new Error(`the Endpoint did not answer in ${ENDPOINT_TIMEOUT / 1000} s`)
    : error;

const postFromPanel = async (
  endpoint: string,
  body: string,
  fetchFn: typeof fetch,
): Promise<EndpointHttpResponse> => {
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(ENDPOINT_TIMEOUT),
  });
  // A body that breaks off reads as no body, not as a network failure
  const text = response.ok ? await response.text().catch(() => "") : "";
  return { status: response.status, text };
};

const parseJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

// Sends one RPC Request of the Panel's own to an Endpoint and resolves to its
// result. An Endpoint the Panel cannot reach at all, such as one whose CORS
// lets only its own site in, is asked again from the inspected page. Throws
// an Error whose message is fit to show the user
export async function sendRpcRequest(
  endpoint: string,
  method: string,
  params: unknown[],
  transport: EndpointTransport = DEFAULT_ENDPOINT_TRANSPORT,
): Promise<unknown> {
  // The id marks it as the Panel's, so the capture skips it when it is sent
  // from the page
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: nextOwnRpcRequestId(),
    method,
    params,
  });
  let response: EndpointHttpResponse;
  try {
    response = await postFromPanel(endpoint, body, transport.fetch);
  } catch (error) {
    // fetch fails with a TypeError only at the network level, CORS included
    if (!(error instanceof TypeError)) {
      throw toUserError(error);
    }
    try {
      response = await transport.postFromPage(endpoint, body, ENDPOINT_TIMEOUT);
    } catch (pageError) {
      throw toUserError(pageError);
    }
  }
  if (response.status < 200 || response.status > 299) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = parseJson(response.text);
  if (result?.error?.message) {
    throw new Error(String(result.error.message));
  }
  return result?.result;
}
