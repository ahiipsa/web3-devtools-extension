// The page global holding the outcome of each post the page is running, by
// its number
const OUTCOMES = "__evmRpcInspectorPosts";
// inspectedWindow.eval does not await a promise, so the Panel polls for it
const POLL_INTERVAL = 100;
// How long past the page's own timeout the Panel waits for its outcome
const POLL_GRACE = 2_000;

// An Endpoint's HTTP answer to a POST
export interface EndpointHttpResponse {
  status: number;
  text: string;
}

type PageOutcome =
  | { done: false }
  | { done: true; status: number; text: string }
  | { done: true; error: string; timeout: boolean };

let lastPost = 0;

const timeoutError = () => {
  const error = new Error("the Endpoint did not answer in time");
  error.name = "TimeoutError";
  return error;
};

const evalInPage = <T>(expression: string) =>
  new Promise<T>((resolve, reject) =>
    chrome.devtools.inspectedWindow.eval<T>(
      expression,
      (result, exceptionInfo) => {
        if (exceptionInfo?.isException || exceptionInfo?.isError) {
          reject(
            new Error(
              exceptionInfo.value ||
                exceptionInfo.description ||
                "the inspected page could not send the request",
            ),
          );
        } else {
          resolve(result);
        }
      },
    ),
  );

// Starts the fetch in the page and returns at once; its outcome lands in the
// page global
const startExpression = (
  post: number,
  endpoint: string,
  body: string,
  timeout: number,
) => `(() => {
  const outcomes = (window[${JSON.stringify(OUTCOMES)}] ??= {});
  outcomes[${post}] = { done: false };
  fetch(${JSON.stringify(endpoint)}, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: ${JSON.stringify(body)},
    credentials: "omit",
    signal: AbortSignal.timeout(${timeout}),
  })
    .then(async (response) => ({ done: true, status: response.status, text: await response.text() }))
    .catch((error) => ({ done: true, error: String(error?.message ?? error), timeout: error?.name === "TimeoutError" }))
    .then((outcome) => { outcomes[${post}] = outcome; });
  return true;
})()`;

// Takes the outcome off the page once it is done; null once the page has
// navigated away and lost it
const pollExpression = (post: number) => `(() => {
  const outcomes = window[${JSON.stringify(OUTCOMES)}];
  const outcome = outcomes?.[${post}] ?? null;
  if (outcome?.done) delete outcomes[${post}];
  return outcome;
})()`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Posts a body to an Endpoint from the inspected page, so it goes out with
// the page's origin and passes an Endpoint's CORS that only lets the page's
// own site in. Rejects with an Error whose message is fit to show the user;
// one named "TimeoutError" when the Endpoint did not answer in `timeout` ms
export async function postFromInspectedPage(
  endpoint: string,
  body: string,
  timeout: number,
): Promise<EndpointHttpResponse> {
  if (typeof chrome === "undefined" || !chrome.devtools?.inspectedWindow) {
    throw new Error("there is no inspected page to send the request from");
  }
  const post = ++lastPost;
  const deadline = Date.now() + timeout + POLL_GRACE;
  await evalInPage(startExpression(post, endpoint, body, timeout));

  for (;;) {
    const outcome = await evalInPage<PageOutcome | null>(pollExpression(post));
    if (!outcome) {
      throw new Error("the inspected page navigated away");
    }
    if (outcome.done) {
      if ("error" in outcome) {
        throw outcome.timeout ? timeoutError() : new Error(outcome.error);
      }
      return { status: outcome.status, text: outcome.text };
    }
    if (Date.now() >= deadline) {
      throw timeoutError();
    }
    await sleep(POLL_INTERVAL);
  }
}
