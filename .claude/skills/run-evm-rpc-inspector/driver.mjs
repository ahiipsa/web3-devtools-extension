#!/usr/bin/env node
// Drives the built EVM RPC Inspector inside real DevTools.
//
//   node .claude/skills/run-evm-rpc-inspector/driver.mjs smoke   # full scenario, exit 1 on any FAIL
//   node .claude/skills/run-evm-rpc-inspector/driver.mjs repl    # line commands on stdin, see HELP
//   import { launch } from "./driver.mjs"                        # the same handles from a script
//
// Loads build/ into Playwright's Chromium (branded Chrome ignores
// --load-extension), opens DevTools on a local dApp page, switches DevTools to
// the EVM RPC Panel and talks to both over CDP. The dApp page sends real
// JSON-RPC over HTTP to a mock node in this process, so the Panel sees it
// through chrome.devtools.network like any other traffic.
//
// Env: EXT (default build/), OUT (screenshots, default /tmp/evm-rpc-inspector-shots),
//      HEADED=1 to put the window on screen, LIGHT=1 for the light DevTools theme.
// On macOS, without HEADED, Chromium starts with `open -g` and stays hidden,
// so it never takes the focus from the user's windows.
import { chromium } from "playwright-core";
import http from "node:http";
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import os, { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import {
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  parseAbi,
  parseAbiParameters,
} from "viem";

const ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const EXT = resolve(process.env.EXT ?? join(ROOT, "build"));
const OUT = process.env.OUT ?? join(tmpdir(), "evm-rpc-inspector-shots");
mkdirSync(OUT, { recursive: true });

export const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const HOLDER = "0x28c6c06298d514db089934071355e5743bf21d60";
const pad = (hex) => hex.replace(/^0x/, "").padStart(64, "0");
export const BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
];

const UPGRADE_TO_ABI = [
  {
    type: "function",
    name: "upgradeTo",
    stateMutability: "nonpayable",
    inputs: [{ name: "newImplementation", type: "address" }],
    outputs: [],
  },
];

// Verified on the fake Sourcify; any other address answers 404. PROXY is a
// proxy Sourcify resolves to IMPLEMENTATION; SLOT_PROXY is unverified and
// names SLOT_IMPLEMENTATION in its EIP-1967 slot on the mock node only
export const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
export const PROXY = "0x4444444444444444444444444444444444444444";
export const IMPLEMENTATION = "0x43506849d7c04f9138d1a2050bbf3a0c054402dd";
export const SLOT_PROXY = "0x5555555555555555555555555555555555555555";
export const SLOT_IMPLEMENTATION = "0x6666666666666666666666666666666666666666";
// Inner Call targets of MULTICALL_FETCH_CALL only: INNER_TOKEN is verified
// on the fake Sourcify, INNER_UNVERIFIED is not
export const INNER_TOKEN = "0x7777777777777777777777777777777777777777";
export const INNER_UNVERIFIED = "0x8888888888888888888888888888888888888888";
// The fake Sourcify answers 500 for it; the fake Etherscan has it verified
export const SOURCIFY_DOWN = "0x3333333333333333333333333333333333333333";
export const SOURCIFY = {
  [WETH]: { abi: BALANCE_OF_ABI, compilation: { name: "WETH9" } },
  [INNER_TOKEN]: { abi: BALANCE_OF_ABI, compilation: { name: "InnerToken" } },
  [PROXY]: {
    abi: UPGRADE_TO_ABI,
    compilation: { name: "FiatTokenProxy" },
    proxyResolution: {
      isProxy: true,
      proxyType: "ZeppelinOSProxy",
      implementations: [{ address: IMPLEMENTATION, name: "FiatTokenV2_2" }],
    },
  },
  [IMPLEMENTATION]: {
    abi: BALANCE_OF_ABI,
    compilation: { name: "FiatTokenV2_2" },
  },
  [SLOT_IMPLEMENTATION]: {
    abi: BALANCE_OF_ABI,
    compilation: { name: "SlotToken" },
  },
};

// The mock node's eth_getStorageAt, by `${address}:${slot}`; any other slot
// holds zero
const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const STORAGE = {
  [`${SLOT_PROXY}:${EIP1967_IMPLEMENTATION_SLOT}`]:
    "0x" + pad(SLOT_IMPLEMENTATION),
};

// Verified on the fake Etherscan only; any other address is not verified
export const LINK = "0x514910771af9ca656af840dff83e8264ecf986ca";
export const ETHERSCAN = {
  [LINK]: { ABI: JSON.stringify(BALANCE_OF_ABI), ContractName: "LinkToken" },
  [SOURCIFY_DOWN]: {
    ABI: JSON.stringify(BALANCE_OF_ABI),
    ContractName: "DownToken",
  },
};

// The mock node's answer per method; anything else gets `result: null`
const ANSWERS = {
  eth_chainId: { result: "0x1" },
  eth_blockNumber: { result: "0x1406f40" },
  eth_getBalance: { result: "0xde0b6b3a7640000" },
  eth_call: { result: "0x" + pad("f4240") }, // 1000000
  eth_estimateGas: { error: { code: 3, message: "execution reverted" } },
};

// Endpoints on another Chain than the node's chain id 1: Base, and a local
// Chain (Hardhat and Anvil's 31337), which has no Explorer
const CHAIN_IDS = { "/base": "0x2105", "/local": "0x7a69" };

// A Multicall3 aggregate3 to an address no ABI Source knows: WETH's
// balanceOf (WETH9 once fetched) succeeds, an unknown call to UNVERIFIED
// reverts with Error("Not allowed")
export const MULTICALL = "0xca11bde05977b3631167028862be2a173976ca11";
export const UNVERIFIED = "0x2222222222222222222222222222222222222222";
// An aggregate3 eth_call to MULTICALL: a balanceOf to `token`, then an
// unknown call to `unverified`
const aggregate3Call = (id, token, unverified) => ({
  jsonrpc: "2.0",
  id,
  method: "eth_call",
  params: [
    {
      to: MULTICALL,
      data: encodeFunctionData({
        abi: parseAbi([
          "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
        ]),
        functionName: "aggregate3",
        args: [
          [
            {
              target: token,
              allowFailure: true,
              callData: "0x70a08231" + pad(HOLDER),
            },
            {
              target: unverified,
              allowFailure: true,
              callData: "0x12345678",
            },
          ],
        ],
      }),
    },
    "latest",
  ],
});
export const MULTICALL_CALL = aggregate3Call(14, WETH, UNVERIFIED);
// The same, to targets the Panel has not seen: their ABIs are fetched
// because of the Multicall alone
export const MULTICALL_FETCH_CALL = aggregate3Call(
  15,
  INNER_TOKEN,
  INNER_UNVERIFIED,
);
// What the mock node answers an eth_call to MULTICALL: the balance, then
// the unknown call's revert
const encodeResults = (results) =>
  encodeAbiParameters(
    parseAbiParameters("(bool success, bytes returnData)[]"),
    [results],
  );
const MULTICALL_RESULT = encodeResults([
  { success: true, returnData: "0x" + pad("f4240") }, // 1000000
  {
    success: false,
    returnData: encodeErrorResult({
      abi: parseAbi(["error Error(string)"]),
      errorName: "Error",
      args: ["Not allowed"],
    }),
  },
]);
// The answer to MULTICALL_FETCH_CALL: the unknown call succeeds, so its
// return data shows raw
export const INNER_RAW_RESULT = "0x" + pad("2a");
const MULTICALL_FETCH_RESULT = encodeResults([
  { success: true, returnData: "0x" + pad("f4240") }, // 1000000
  { success: true, returnData: INNER_RAW_RESULT },
]);

// What `traffic` sends: a single request, a batch, a call to TOKEN, a revert
// and one POST that is not JSON-RPC (the Panel must skip it). Five RPC Requests.
export const TRAFFIC = [
  { jsonrpc: "2.0", id: 1, method: "eth_chainId" },
  [
    { jsonrpc: "2.0", id: 2, method: "eth_blockNumber" },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "eth_getBalance",
      params: [HOLDER, "latest"],
    },
  ],
  {
    jsonrpc: "2.0",
    id: 4,
    method: "eth_call",
    params: [{ to: TOKEN, data: "0x70a08231" + pad(HOLDER) }, "latest"],
  },
  {
    jsonrpc: "2.0",
    id: 5,
    method: "eth_estimateGas",
    params: [{ to: TOKEN, data: "0xdeadbeef" }],
  },
  "not json-rpc",
];

const DAPP = `<!doctype html><title>dApp</title><h1>dApp</h1><script>
window.rpc = async (body, path = "/rpc") => (await fetch(path, { method: "POST", headers: { "content-type": "application/json" },
  body: typeof body === "string" ? body : JSON.stringify(body) })).text();
</script>`;

// Every RPC Request the node got, with its Origin: the Panel's own
// eth_chainId comes from chrome-extension://
const nodeLog = [];

const startNode = () =>
  new Promise((ready) => {
    const server = http.createServer((req, res) => {
      // Open CORS, like public RPC nodes, so the Panel can ask for eth_chainId
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-headers", "content-type");
      if (req.method === "OPTIONS") return res.writeHead(204).end();
      if (req.method === "GET") return res.end(DAPP);
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return res.end("ok");
        }
        for (const r of [parsed].flat())
          nodeLog.push({
            origin: req.headers.origin ?? "",
            path: req.url,
            method: r?.method,
          });
        const one = (r) => ({
          jsonrpc: "2.0",
          id: r.id,
          ...(r.method === "eth_call" &&
          String(r.params?.[0]?.to).toLowerCase() === MULTICALL
            ? {
                result:
                  r.id === MULTICALL_FETCH_CALL.id
                    ? MULTICALL_FETCH_RESULT
                    : MULTICALL_RESULT,
              }
            : r.method === "eth_getStorageAt"
              ? {
                  result:
                    STORAGE[
                      `${String(r.params?.[0]).toLowerCase()}:${r.params?.[1]}`
                    ] ?? "0x" + pad("0"),
                }
              : r.method === "eth_chainId" && CHAIN_IDS[req.url]
                ? { result: CHAIN_IDS[req.url] }
                : (ANSWERS[r.method] ?? { result: null })),
        });
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify(Array.isArray(parsed) ? parsed.map(one) : one(parsed)),
        );
      });
    });
    server.listen(0, "127.0.0.1", () => ready(server));
  });

// Longer than any single command takes; a missing answer means a dead target
const CDP_TIMEOUT = 30_000;

// Minimal CDP client over a target's own websocket
const connectTarget = async (cdpPort, match) => {
  for (let i = 0; i < 50; i++) {
    const targets = await (
      await fetch(`http://127.0.0.1:${cdpPort}/json`)
    ).json();
    const target = targets.find((t) => match(t.url));
    if (target) {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((ok, fail) => {
        ws.onopen = ok;
        ws.onerror = ws.onclose = () =>
          fail(new Error("CDP socket failed to open: " + target.url));
      });
      let id = 0;
      const pending = new Map();
      const events = [];
      const handlers = new Map();
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id && pending.has(d.id)) {
          pending.get(d.id).ok(d);
          pending.delete(d.id);
        } else if (d.method) {
          events.push(d);
          handlers.get(d.method)?.(d.params);
        }
      };
      // A target that goes away (the browser crashed, the Panel reloaded)
      // fails what is still waiting instead of hanging the run
      ws.onclose = () => {
        for (const { fail } of pending.values())
          fail(new Error("CDP target closed: " + target.url));
        pending.clear();
      };
      const send = (method, params = {}) =>
        new Promise((ok, fail) => {
          if (ws.readyState !== WebSocket.OPEN)
            return fail(new Error("CDP target closed: " + target.url));
          const i = ++id;
          const timer = setTimeout(() => {
            pending.delete(i);
            fail(new Error(`CDP ${method} got no answer in ${CDP_TIMEOUT} ms`));
          }, CDP_TIMEOUT);
          pending.set(i, {
            ok: (d) => (clearTimeout(timer), ok(d)),
            fail: (e) => (clearTimeout(timer), fail(e)),
          });
          ws.send(JSON.stringify({ id: i, method, params }));
        });
      const evaluate = async (expression) => {
        const d = await send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        const ex = d.result?.exceptionDetails;
        if (ex) throw new Error(ex.exception?.description ?? ex.text);
        return d.result?.result?.value;
      };
      // One handler per CDP event
      const on = (method, handler) => handlers.set(method, handler);
      return { send, evaluate, events, on, close: () => ws.close() };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("no CDP target matching " + match);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY_CODES = {
  Escape: 27,
  Enter: 13,
  Tab: 9,
  ArrowDown: 40,
  ArrowUp: 38,
  ArrowLeft: 37,
  ArrowRight: 39,
  Home: 36,
  End: 35,
};
const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
const answerEtherscan = (url) => {
  const address = new URL(url).searchParams.get("address")?.toLowerCase();
  const fixture = ETHERSCAN[address] ?? {
    ABI: "Contract source code not verified",
    ContractName: "",
  };
  return {
    status: 200,
    body: {
      status: "1",
      message: "OK",
      result: [{ SourceCode: "", ...fixture }],
    },
  };
};

const answerSourcify = (url) => {
  const address = /\/contract\/\d+\/(0x[0-9a-fA-F]{40})/
    .exec(url)?.[1]
    ?.toLowerCase();
  if (address === SOURCIFY_DOWN) {
    return { status: 500, body: { error: "Internal Server Error" } };
  }
  const fixture = SOURCIFY[address];
  return fixture
    ? { status: 200, body: fixture }
    : {
        status: 404,
        body: { error: "Contract not found", customCode: "not_found" },
      };
};

// Answers the Panel's requests to https://sourcify.dev/* from SOURCIFY and to
// https://api.etherscan.io/* from ETHERSCAN, so nothing reaches the real ABI
// Sources; returns the URLs each was asked for
const interceptAbiSources = async (panel) => {
  const sourcifyUrls = [];
  const etherscanUrls = [];
  panel.on("Fetch.requestPaused", ({ requestId, request }) => {
    const etherscan = request.url.startsWith("https://api.etherscan.io/");
    (etherscan ? etherscanUrls : sourcifyUrls).push(request.url);
    const { status, body } = (etherscan ? answerEtherscan : answerSourcify)(
      request.url,
    );
    // Fire and forget: a Panel that went away no longer waits for the answer
    panel
      .send("Fetch.fulfillRequest", {
        requestId,
        responseCode: status,
        responseHeaders: [
          { name: "content-type", value: "application/json" },
          { name: "access-control-allow-origin", value: "*" },
        ],
        body: Buffer.from(JSON.stringify(body)).toString("base64"),
      })
      .catch(() => {});
  });
  await panel.send("Fetch.enable", {
    patterns: [
      { urlPattern: "https://sourcify.dev/*" },
      { urlPattern: "https://api.etherscan.io/*" },
    ],
  });
  return { sourcifyUrls, etherscanUrls };
};

const LEGACY = `(async () => (await import("./ui/legacy/legacy.js")).InspectorView.InspectorView.instance())()`;

// The switches launchPersistentContext adds itself, for a Chromium started
// without Playwright (--use-mock-keychain spares a keychain prompt). Not
// public API: read only on the macOS background path, from the pinned version
const playwrightSwitches = () => {
  const require = createRequire(import.meta.url);
  return require(
    join(
      dirname(require.resolve("playwright-core")),
      "lib/server/chromium/chromiumSwitches.js",
    ),
  ).chromiumSwitches;
};
// The window launchPersistentContext opens for a 1200×800 viewport on macOS
const WINDOW_SIZE = "--window-size=1202,870";

const waitFor = async (read, what, timeout = 30_000) => {
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(100)) {
    const value = read();
    if (value) return value;
  }
  throw new Error(`no ${what} in ${timeout} ms`);
};

// Hides the app with this pid whenever it is not hidden, until it exits: a
// hide right after launch is ignored, and a new window can unhide it. The
// run loop keeps `hidden` up to date
const KEEP_HIDDEN = `ObjC.import("AppKit");
function run([pid]) {
  for (;;) {
    const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(pid));
    if (app.isNil() || app.terminated) return;
    if (!app.hidden) app.hide;
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1));
  }
}`;

// Starts Playwright's Chromium with `open -g`, which never activates it,
// keeps it hidden and attaches over CDP. `open` does not make Chromium a child of
// this process, so it is stopped by pid, also when the run dies
const openInBackground = async (profile, args) => {
  const executable = chromium.executablePath();
  // The browser process, not its helpers: those carry a --type
  const findPid = () =>
    execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim().match(/^(\d+) (.*)$/))
      .find(
        (m) =>
          m &&
          m[2].startsWith(executable + " ") &&
          m[2].includes(`--user-data-dir=${profile}`) &&
          !m[2].includes("--type="),
      )?.[1];
  let pid, keepHidden;
  // Synchronous, as it also runs on "exit": the browser quits on SIGTERM, is
  // killed if it has not after 5 s, and the profile goes once nothing of
  // Chromium writes to it any more
  const alive = (p) => {
    try {
      return process.kill(Number(p), 0);
    } catch {
      return false;
    }
  };
  const waitSync = (ok, ms) => {
    for (const end = Date.now() + ms; !ok() && Date.now() < end; )
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    return ok();
  };
  // A signal would end the process without "exit"
  const exitOn = (signal) => process.exit(128 + os.constants.signals[signal]);
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  const stop = () => {
    process.off("exit", stop);
    for (const signal of signals) process.off(signal, exitOn);
    keepHidden?.kill();
    pid ??= findPid();
    // Chromium can exit between a check and a kill
    const kill = (signal) => {
      try {
        process.kill(Number(pid), signal);
      } catch {
        // already gone
      }
    };
    if (pid) {
      kill("SIGTERM");
      if (!waitSync(() => !alive(pid), 5000)) {
        kill("SIGKILL");
        waitSync(() => !alive(pid), 2000);
      }
    }
    const helpers = () =>
      execFileSync("ps", ["-axo", "command="], { encoding: "utf8" }).includes(
        profile,
      );
    waitSync(() => !helpers(), 2000);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  process.on("exit", stop);
  for (const signal of signals) process.on(signal, exitOn);
  execFileSync("open", [
    "-g",
    "-n",
    "-a",
    executable.replace(/\.app\/.*$/, ".app"),
    "--args",
    ...playwrightSwitches(),
    "--enable-use-zoom-for-dsf=false",
    "--no-sandbox",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=0",
    WINDOW_SIZE,
    ...args,
    "about:blank",
  ]);
  pid = await waitFor(findPid, "Chromium process");
  keepHidden = spawn(
    "osascript",
    ["-l", "JavaScript", "-e", KEEP_HIDDEN, pid],
    {
      stdio: "ignore",
    },
  );
  keepHidden.unref();
  const portFile = join(profile, "DevToolsActivePort");
  const cdpPort = await waitFor(
    () => existsSync(portFile) && readFileSync(portFile, "utf8").split("\n")[0],
    "DevToolsActivePort",
  );
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  const context = browser.contexts()[0];
  // A new page made with Playwright would bring Chromium to the front
  const newPage = async () => {
    const session = await browser.newBrowserCDPSession();
    const opened = context.waitForEvent("page");
    await session.send("Target.createTarget", {
      url: "about:blank",
      background: true,
    });
    await session.detach();
    return opened;
  };
  return {
    cdpPort,
    page: context.pages()[0] ?? (await newPage()),
    newPage,
    close: async () => {
      await browser.close().catch(() => {});
      stop();
    },
  };
};

// Playwright's own launch, which activates Chromium: on screen with HEADED,
// and off screen elsewhere than macOS, where --window-position does nothing
const launchPlaywright = async (profile, args) => {
  const context = await chromium.launchPersistentContext(profile, {
    // DevTools never open in headless mode, so the window is real
    headless: false,
    args: [
      ...args,
      "--remote-debugging-port=0",
      ...(process.env.HEADED || process.platform === "darwin"
        ? []
        : ["--window-position=-3000,-3000"]),
    ],
    viewport: { width: 1200, height: 800 },
  });
  const cdpPort = readFileSync(
    join(profile, "DevToolsActivePort"),
    "utf8",
  ).split("\n")[0];
  return {
    cdpPort,
    page: context.pages()[0] ?? (await context.newPage()),
    newPage: () => context.newPage(),
    close: async () => {
      await context.close();
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    },
  };
};

export async function launch() {
  const node = await startNode();
  const origin = `http://127.0.0.1:${node.address().port}`;
  const profile = mkdtempSync(join(tmpdir(), "evm-rpc-profile-"));
  const browser = await (
    process.platform === "darwin" && !process.env.HEADED
      ? openInBackground
      : launchPlaywright
  )(profile, [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--auto-open-devtools-for-tabs",
    // DevTools follow the system scheme; this forces light (themeName "default")
    ...(process.env.LIGHT ? ["--blink-settings=preferredColorScheme=1"] : []),
  ]);
  const { cdpPort, page } = browser;
  await page.goto(origin + "/");

  const devtools = await connectTarget(cdpPort, (u) =>
    u.startsWith("devtools://devtools/bundled/devtools_app"),
  );
  // The extension's devtools page registers the Panel a moment after DevTools loads
  let panelId;
  for (let i = 0; i < 50 && !panelId; i++) {
    const ids = await devtools
      .evaluate(`(async () => (await ${LEGACY}).tabbedPane.tabIds())()`)
      .catch(() => []);
    panelId = ids.find(
      (id) => id.startsWith("chrome-extension://") && /EVM ?RPC/.test(id),
    );
    if (!panelId) await sleep(200);
  }
  if (!panelId)
    throw new Error("EVM RPC Panel not registered: is build/ built?");
  await devtools.evaluate(
    `(async () => { await (await ${LEGACY}).showPanel(${JSON.stringify(panelId)}); return 1 })()`,
  );
  const panel = await connectTarget(cdpPort, (u) =>
    /^chrome-extension:\/\/[a-z]+\/index\.html/.test(u),
  );
  await panel.send("Runtime.enable");
  const { sourcifyUrls, etherscanUrls } = await interceptAbiSources(panel);
  for (
    let i = 0;
    i < 50 && !(await panel.evaluate(`!!document.querySelector(".rpc-table")`));
    i++
  )
    await sleep(100);

  const ev = (js) => panel.evaluate(js);
  // The Panel iframe fills DevTools flush right and bottom, under the tab strip
  const offset = async () => {
    const [dw, dh] = await devtools.evaluate("[innerWidth, innerHeight]");
    const [pw, ph] = await ev("[innerWidth, innerHeight]");
    return [dw - pw, dh - ph];
  };
  const api = {
    page,
    devtools,
    panel,
    ev,
    sleep,
    // Polls `read` until `ok` holds for what it returns, or `timeout` ms
    // pass, and returns the last value either way, so a check can still
    // print it. The Panel captures, decodes and fetches asynchronously: wait
    // for the state a check needs rather than for a fixed time. A `read` that
    // throws (the Panel mid-reload) is retried, and rethrown at the timeout
    until: async (read, ok = Boolean, timeout = 5000) => {
      const end = Date.now() + timeout;
      for (;;) {
        try {
          const value = await read();
          if (ok(value) || Date.now() > end) return value;
        } catch (e) {
          if (Date.now() > end) throw e;
        }
        await sleep(100);
      }
    },
    // The `n`-th RPC Request row whose Method, Contract and Function equal
    // what `match` gives, as a selector for `click`, or null. With the details
    // open the Contract and Function come from the row's tooltip
    rowSelector: (match, n = 0) =>
      ev(`(() => {
        const match = ${JSON.stringify(match)};
        const rows = [...document.querySelectorAll(".rpc-table-body [role=row]")]
          .filter((row) => {
            const [method, , contract, fn] = [...row.querySelectorAll("[role=gridcell]")]
              .map((cell) => cell.innerText.trim());
            const hidden = Object.fromEntries(row.title.split("\\n").map((line) =>
              [line.slice(0, line.indexOf(": ")), line.slice(line.indexOf(": ") + 2)]));
            const cells = {
              method: method?.split(" ")[0],
              contract: contract ?? hidden.Contract,
              fn: fn ?? hidden.Function,
            };
            return Object.entries(match).every(([key, value]) => cells[key] === value);
          });
        return rows[${n}] ? "#" + CSS.escape(rows[${n}].id) : null;
      })()`),
    // Requests the Panel sent to the fake ABI Sources, and that the node got
    sourcifyUrls,
    etherscanUrls,
    nodeLog,
    // Sends one request body (object, batch array or raw string) from the dApp
    // page; another `path` is another Endpoint
    rpc: async (body, path = "/rpc") => {
      const response = await page.evaluate(
        ([b, p]) => window.rpc(b, p),
        [body, path],
      );
      await sleep(400); // the Panel gets the entry asynchronously
      return response;
    },
    traffic: async () => {
      for (const body of TRAFFIC)
        await page.evaluate((b) => window.rpc(b), body);
      await sleep(600);
    },
    // Real mouse click on the first element matching `selector` (and, if given,
    // whose text or aria-label equals `text`)
    click: async (selector, text) => {
      const point = await ev(`(() => {
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
        const el = ${text === undefined ? "els[0]" : `els.find((e) => e.innerText.trim() === ${JSON.stringify(text)} || e.getAttribute("aria-label") === ${JSON.stringify(text)})`};
        if (!el) return null;
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        const r = el.getBoundingClientRect();
        return [r.x + Math.min(r.width / 2, 30), r.y + r.height / 2];
      })()`);
      if (!point)
        throw new Error(`nothing to click: ${selector} ${text ?? ""}`);
      const [ox, oy] = await offset();
      const p = {
        x: point[0] + ox,
        y: point[1] + oy,
        button: "left",
        clickCount: 1,
      };
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"])
        await devtools.send("Input.dispatchMouseEvent", { type, ...p });
      await sleep(250);
    },
    // Waits for the row `rowSelector` finds and clicks it
    clickRow: async (match, n = 0) => {
      const selector = await api.until(() => api.rowSelector(match, n));
      if (!selector) throw new Error(`no row ${JSON.stringify(match)} #${n}`);
      await api.click(selector);
    },
    // Real key press, delivered to whatever has focus, DevTools' own listeners included.
    // `mods`: any of "meta", "ctrl", "alt", "shift"
    key: async (key, ...mods) => {
      const modifiers = mods.reduce((m, name) => m | MODIFIERS[name], 0);
      const single = key.length === 1;
      const base = {
        key,
        code: single ? "Key" + key.toUpperCase() : key,
        windowsVirtualKeyCode: single
          ? key.toUpperCase().charCodeAt(0)
          : KEY_CODES[key],
        modifiers,
      };
      await devtools.send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        ...base,
      });
      await devtools.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      await sleep(250);
    },
    type: async (text) => {
      await devtools.send("Input.insertText", { text });
      await sleep(150);
    },
    // Screenshot of the whole DevTools window, Panel included
    shot: async (name) => {
      const d = await devtools.send("Page.captureScreenshot", {
        format: "png",
      });
      const file = join(OUT, name + ".png");
      writeFileSync(file, Buffer.from(d.result.data, "base64"));
      return file;
    },
    drawerOpen: () =>
      devtools.evaluate(`(async () => (await ${LEGACY}).drawerVisible())()`),
    closeDrawer: async () => {
      await devtools.evaluate(
        `(async () => { (await ${LEGACY}).closeDrawer(); return 1 })()`,
      );
      await sleep(300);
      return devtools.evaluate(
        `(async () => (await ${LEGACY}).drawerVisible())()`,
      );
    },
    rows: () =>
      ev(
        `[...document.querySelectorAll(".rpc-table-body [role=row]")].map((r) => r.innerText.split("\\n")[0])`,
      ),
    selected: () =>
      ev(
        `document.querySelector("[role=row][aria-selected=true]")?.innerText.split("\\n")[0] ?? null`,
      ),
    // Each row's cells, as text, in column order
    rowCells: () =>
      ev(
        `[...document.querySelectorAll(".rpc-table-body [role=row]")].map((r) => [...r.querySelectorAll("[role=gridcell]")].map((c) => c.innerText.trim()))`,
      ),
    selectedCells: () =>
      ev(
        `[...(document.querySelector("[role=row][aria-selected=true]")?.querySelectorAll("[role=gridcell]") ?? [])].map((c) => c.innerText.trim())`,
      ),
    // Each row's Chain cell, as text and tooltip
    rowChains: () =>
      ev(
        `[...document.querySelectorAll(".rpc-table-body [role=row]")].map((r) => { const cell = r.querySelectorAll("[role=gridcell]")[1]; return cell && [cell.innerText.trim(), cell.title]; })`,
      ),
    // Each row's tooltip, which with the details open tells the hidden columns
    rowTitles: () =>
      ev(
        `[...document.querySelectorAll(".rpc-table-body [role=row]")].map((r) => r.title)`,
      ),
    // The header cells' rendered widths, in column order
    headerWidths: () =>
      ev(
        `[...document.querySelectorAll(".rpc-table-header [role=columnheader]")].map((h) => Math.round(h.getBoundingClientRect().width))`,
      ),
    headers: () =>
      ev(
        `[...document.querySelectorAll(".rpc-table-header [role=columnheader]")].map((h) => h.innerText.trim())`,
      ),
    // The selected row's height and top, which opening the details must not move
    selectedBox: () =>
      ev(`(() => {
        const r = document.querySelector("[role=row][aria-selected=true]")?.getBoundingClientRect();
        return r ? [r.height, r.top] : null;
      })()`),
    // The table header's and the details tab bar's top, height, background
    // and bottom border, which line up as one strip across the split
    headerBars: () =>
      ev(`[".rpc-table-header", ".rpc-details-tab-bar"].map((selector) => {
        const e = document.querySelector(selector);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        const style = getComputedStyle(e);
        return [Math.round(r.top), Math.round(r.height), style.backgroundColor, style.borderBottom];
      })`),
    // The Network tab's filter bar and the Panel's toolbar, measured alike:
    // the bar's height, background and bottom border, the filter field's
    // height, radius and fill, a pressed and an unpressed type button, and
    // `shot`, a screenshot of the bar as base64 PNG. Shows
    // the Network panel for its part, then the Panel again
    filterBars: async () => {
      const measure = (bar, field, fieldFill, pressed, unpressed) => `(() => {
        const box = (e) => e.getBoundingClientRect();
        const style = (e, pseudo) => getComputedStyle(e, pseudo);
        const chip = (e) => [Math.round(box(e).height * 10) / 10, style(e).fontSize, style(e).fontWeight, style(e).color, style(e).backgroundColor, style(e).outlineColor + " " + style(e).outlineStyle];
        const bar = ${bar}, field = ${field};
        return {
          barHeight: Math.round(box(bar).height),
          barBg: style(bar).backgroundColor,
          barBorder: style(bar).borderBottom,
          fontSize: style(bar).fontSize,
          fontFamily: style(bar).fontFamily,
          fieldHeight: Math.round(box(field).height),
          fieldRadius: style(field).borderRadius,
          fieldFill: ${fieldFill},
          pressedChip: chip(${pressed}),
          chip: chip(${unpressed}),
          rect: [box(bar).x, box(bar).y, box(bar).width, box(bar).height].map(Math.round),
        };
      })()`;
      await devtools.evaluate(
        `(async () => { await (await ${LEGACY}).showPanel("network"); return 1 })()`,
      );
      const deep = `const deep = (root, sel) => root.querySelector(sel) ?? [...root.querySelectorAll("*")].map((e) => e.shadowRoot && deep(e.shadowRoot, sel)).find(Boolean);`;
      const network = await api.until(() =>
        devtools.evaluate(`(() => { ${deep}
          const filterBar = deep(document, ".filter-bar");
          if (!filterBar?.getBoundingClientRect().height) return null;
          return ${measure(
            "filterBar",
            'deep(bar, ".toolbar-input")',
            'style(field, "::before").backgroundColor',
            'bar.querySelector(".filter-bitset-filter span.selected")',
            'bar.querySelector(".filter-bitset-filter span:not(.selected)")',
          )}; })()`),
      );
      if (!network) throw new Error("the Network panel shows no filter bar");
      network.shot = await api.clip(network.rect);
      await devtools.evaluate(
        `(async () => { await (await ${LEGACY}).showPanel(${JSON.stringify(panelId)}); return 1 })()`,
      );
      // Clicks land by the Panel's offset in DevTools: wait until the Panel
      // is selected again and its frame has stopped moving
      let last;
      const settled = await api.until(async () => {
        const selected = await devtools.evaluate(
          `(async () => (await ${LEGACY}).tabbedPane.selectedTabId)()`,
        );
        const now = JSON.stringify([
          selected,
          await offset(),
          await ev("innerWidth"),
        ]);
        const settled = selected === panelId && now === last;
        last = now;
        return settled;
      });
      if (!settled) throw new Error("the Panel did not come back from Network");
      const ours = await ev(
        measure(
          'document.querySelector(".rpc-table-toolbar")',
          'document.querySelector(".rpc-table-search")',
          "style(field).backgroundColor",
          'document.querySelector(".rpc-table-chip-pressed")',
          'document.querySelector(".rpc-table-chip:not(.rpc-table-chip-pressed)")',
        ),
      );
      const [ox, oy] = await offset();
      ours.rect = [ours.rect[0] + ox, ours.rect[1] + oy, ...ours.rect.slice(2)];
      ours.shot = await api.clip(ours.rect);
      return { network, ours };
    },
    // The part of DevTools at `rect`, as a full screenshot (base64 PNG) and
    // where to crop it. A clipped Page.captureScreenshot would swallow the
    // next click into the Panel
    clip: async (rect) => ({
      rect,
      width: await devtools.evaluate("innerWidth"),
      data: (await devtools.send("Page.captureScreenshot", { format: "png" }))
        .result.data,
    }),
    // Clips stacked one under the other with a label, into `$OUT/<name>.png`.
    // It renders them in a new tab, which unsettles DevTools: call it once
    // the checks are done
    stackShots: async (name, clips) => {
      const sheet = await browser.newPage();
      await sheet.setContent(
        `<body style="margin:0;padding:8px;background:#888;font:12px system-ui;display:inline-block">${clips
          .map(
            ([
              label,
              {
                rect: [x, y, w, h],
                width,
                data,
              },
            ]) =>
              `<div style="margin:4px 0">${label}</div><div style="width:${w}px;height:${h}px;background:url(data:image/png;base64,${data}) -${x}px -${y}px / ${width}px auto no-repeat"></div>`,
          )
          .join("")}</body>`,
      );
      const file = join(OUT, name + ".png");
      await sheet.locator("body").screenshot({ path: file });
      await sheet.close();
      return file;
    },
    detailsOpen: () =>
      ev(`document.querySelectorAll(".rpc-details-tab").length > 0`),
    text: () => ev("document.body.innerText"),
    // Uncaught exceptions and console.error in the Panel since launch
    errors: () =>
      panel.events
        .filter(
          (e) =>
            e.method === "Runtime.exceptionThrown" ||
            (e.method === "Runtime.consoleAPICalled" &&
              e.params.type === "error"),
        )
        .map(
          (e) =>
            (
              e.params.exceptionDetails?.exception?.description ??
              e.params.args?.map((a) => a.value ?? a.description).join(" ") ??
              ""
            ).split("\n")[0],
        ),
    close: async () => {
      await browser.close();
      node.close();
    },
  };
  return api;
}

async function smoke() {
  const app = await launch();
  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(
      `${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`,
    );
    console.log(results.at(-1));
  };
  const { click, clickRow, key, type, shot, ev, until } = app;
  // In the Contract and Function columns, or with the details open in a
  // row's tooltip
  const callsContract = async (contract, fn) =>
    (await app.rowCells()).some(
      (cells) => cells[2] === contract && cells[3] === fn,
    ) ||
    (await app.rowTitles()).some((title) =>
      title.includes(`Contract: ${contract}\nFunction: ${fn}\n`),
    );
  // Wait for the decoded row or the Panel text a check needs
  const callsContractSoon = (contract, fn) =>
    until(() => callsContract(contract, fn));
  const textSoon = (test) => until(app.text, test);
  // A check that something happened only once, or not at all, cannot wait
  // for a state: it gives the Panel this long to do it anyway
  const DUPLICATE_WINDOW = 500;
  const json = (value) => JSON.stringify(value);
  try {
    await shot("01-empty");
    await app.traffic();
    const rows = await until(app.rows, (rows) => rows.length === 5);
    check(
      "captures real traffic: batch split, non-RPC POST skipped",
      rows.length === 5,
      rows.join(", "),
    );
    await shot("02-table");
    check(
      "the header reads Method, Chain, Contract, …",
      json(await app.headers()) ===
        json([
          "Method",
          "Chain",
          "Contract",
          "Function",
          "Status",
          "Endpoint",
          "Time",
        ]),
      json(await app.headers()),
    );
    // The mock node serves chain id 1, captured from the page's eth_chainId
    const chains = await until(app.rowChains, (chains) =>
      chains.every((chain) => chain?.[0] === "Ethereum"),
    );
    check(
      "every row of the standard traffic shows the Endpoint's Chain by name, its id in the tooltip",
      chains.length === 5 &&
        chains.every(
          (chain) => chain[0] === "Ethereum" && chain[1] === "Chain 1",
        ),
      json(chains),
    );

    // The toolbar looks like the Network tab's filter bar, measured in both
    // Network's internals may move in another Chrome: fail these checks only
    const bars = await app.filterBars().catch((e) => {
      check("the Network filter bar measured", false, e.message);
      return null;
    });
    for (const property of Object.keys(bars?.network ?? {}).filter(
      (p) => p !== "rect" && p !== "shot",
    ))
      check(
        `the toolbar's ${property} matches the Network filter bar's`,
        json(bars.ours[property]) === json(bars.network[property]),
        `Network ${json(bars.network[property])} · ours ${json(bars.ours[property])}`,
      );
    const toolbarOrder = await ev(
      `[...document.querySelectorAll(".rpc-table-toolbar-items > button, .rpc-table-search-input, .rpc-table-errors, .rpc-table-chip")].map((e) => e.getAttribute("aria-label") ?? e.innerText.trim()).join()`,
    );
    check(
      "the toolbar reads Clear, Filter, Errors, All, then the Method Categories",
      toolbarOrder ===
        "Clear,Filter,Errors,All,Calls,Transactions,Logs,Chain,Other",
      toolbarOrder,
    );
    // The default side-docked DevTools is about 550 px wide
    check(
      "⚙ ends the toolbar's first line at side-docked width",
      await ev(`(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const gear = box(".rpc-table-settings-button"), clear = box(".rpc-table-toolbar-button"), bar = box(".rpc-table-toolbar");
        return gear.top === clear.top && Math.round(bar.right - gear.right) <= 3; })()`),
      `Panel ${await ev("innerWidth")} px, toolbar ${bars?.ours.barHeight} px high`,
    );
    const closedWidths = await app.headerWidths();

    await clickRow({ method: "eth_call" });
    check(
      "click opens the details",
      (await app.detailsOpen()) && (await app.selected()) === "eth_call",
    );
    await click(".rpc-details-tab", "Contract");
    const contractTab = await textSoon(
      (text) =>
        /No verified ABI on Sourcify/.test(text) && /Fetch ABI/.test(text),
    );
    check(
      "a 404 from Sourcify shows no verified ABI and Fetch ABI",
      /No verified ABI on Sourcify/.test(contractTab) &&
        /Fetch ABI/.test(contractTab),
    );
    check(
      "Sourcify asked once for the called address on the captured Chain",
      app.sourcifyUrls.join() ===
        "https://sourcify.dev/server/v2/contract/1/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48?fields=abi,compilation,proxyResolution",
      app.sourcifyUrls.join(", "),
    );
    await click(".rpc-details input");
    await type("USDC");
    await click(".rpc-details textarea");
    await type(JSON.stringify(BALANCE_OF_ABI));
    await click("button", "Save");
    await until(() =>
      ev(
        `chrome.storage.local.get("contracts").then((s) => !!s.contracts?.["${TOKEN}"])`,
      ),
    );
    await click(".rpc-details-tab", "Params");
    const params = await textSoon(
      (text) =>
        /balanceOf\(address account\)/.test(text) &&
        /account\s+address\s+0x28C6/i.test(text),
    );
    check(
      "Contract saved, input decoded with named arguments",
      /balanceOf\(address account\)/.test(params) &&
        /account\s+address\s+0x28C6/i.test(params),
    );
    await shot("03-params-decoded");
    await click(".rpc-details-tab", "Response");
    check(
      "return value decoded by name",
      /balance\s+uint256\s+1000000/.test(
        await textSoon((text) => /balance\s+uint256\s+1000000/.test(text)),
      ),
    );
    check(
      "table row names Contract and function in their columns",
      await callsContractSoon("USDC", "balanceOf"),
      json(await app.rowCells()),
    );
    // The details hide every column but Method, not the rows' one line
    const host = new URL(app.page.url()).host;
    check(
      "with the details open the header shows Method only",
      json(await app.headers()) === json(["Method"]),
      json(await app.headers()),
    );
    check(
      "with the details open no row shows a Contract or the Endpoint host",
      (await app.rowCells()).every((cells) => cells.length === 1) &&
        !(await app.rowCells()).some((cells) =>
          cells.some((text) => text.includes(host) || text.includes("USDC")),
        ),
      json(await app.rowCells()),
    );
    check(
      "with the details open a row's tooltip tells its Chain, Contract, Function, Status, Endpoint and Time",
      new RegExp(
        `^Chain: Ethereum\\nContract: USDC\\nFunction: balanceOf\\nStatus: ok\\nEndpoint: ${host}\\nTime: \\d+ ms$`,
      ).test(
        await ev(
          `document.querySelector("[role=row][aria-selected=true]")?.title`,
        ),
      ),
      await ev(
        `document.querySelector("[role=row][aria-selected=true]")?.title`,
      ),
    );
    check(
      "with the details open Method takes the table's whole side",
      await ev(`(() => {
        const scroll = document.querySelector(".rpc-table-scroll");
        const method = document.querySelector(".rpc-table-header [role=columnheader]");
        return scroll.scrollWidth <= scroll.clientWidth &&
          Math.round(method.getBoundingClientRect().width) === scroll.clientWidth;
      })()`),
      await ev(
        `Math.round(document.querySelector(".rpc-table-header [role=columnheader]").getBoundingClientRect().width) + " in " + document.querySelector(".rpc-table-scroll").clientWidth`,
      ),
    );

    // Keyboard, through real key events that DevTools' own listeners also see
    const drawer = await app.drawerOpen();
    await key("Escape");
    check("Esc closes the details", !(await app.detailsOpen()));
    check(
      "Esc does not also open the DevTools drawer",
      (await app.drawerOpen()) === drawer,
    );
    check(
      "Esc with focus in the details hands focus to the table",
      await ev(
        `document.activeElement?.classList.contains("rpc-table-scroll")`,
      ),
    );
    check(
      "Esc keeps the RPC Request selected",
      (await app.selected()) === "eth_call",
    );
    check(
      "with the details closed the header shows every column",
      json(await app.headers()) ===
        json([
          "Method",
          "Chain",
          "Contract",
          "Function",
          "Status",
          "Endpoint",
          "Time",
        ]),
      json(await app.headers()),
    );
    check(
      "closing the details restores every column at its width",
      json(await app.headerWidths()) === json(closedWidths),
      `${json(closedWidths)} → ${json(await app.headerWidths())}`,
    );
    const closedBox = await app.selectedBox();
    const [closedHeader] = await app.headerBars();
    check(
      "with the details closed the table header is 26px high",
      closedHeader?.[1] === 26,
      json(closedHeader),
    );
    await key("Enter");
    check("Enter reopens the details", await app.detailsOpen());
    const openBox = await app.selectedBox();
    const [openHeader, tabBar] = await app.headerBars();
    check(
      "the table header and the details tab bar share top, height, background and bottom border",
      openHeader?.[1] === 26 && json(openHeader) === json(tabBar),
      `${json(openHeader)} vs ${json(tabBar)}`,
    );
    await key("Escape");
    const closedAgainBox = await app.selectedBox();
    await key("Enter");
    check(
      "opening and closing the details keeps the selected row's height and top",
      closedBox?.[0] === 21 &&
        json(openBox) === json(closedBox) &&
        json(closedAgainBox) === json(closedBox),
      `${json(closedBox)} → ${json(openBox)} → ${json(closedAgainBox)}`,
    );
    await key("ArrowDown");
    check(
      "ArrowDown selects the next RPC Request",
      (await app.selected()) === "eth_estimateGas",
    );
    await key("Home");
    check("Home selects the first", (await app.selected()) === "eth_chainId");
    await key("End");
    check("End selects the last", (await app.selected()) === "eth_estimateGas");
    await key("ArrowUp");
    check(
      "ArrowUp selects the previous",
      (await app.selected()) === "eth_call",
    );
    await clickRow({ method: "eth_call" });
    await clickRow({ method: "eth_call" });
    check(
      "clicking the selected row keeps the details open",
      (await app.detailsOpen()) && (await app.selected()) === "eth_call",
    );
    await click(".rpc-details-close");
    check(
      "✕ closes the details and hands focus to the table",
      !(await app.detailsOpen()) &&
        (await ev(
          `document.activeElement?.classList.contains("rpc-table-scroll")`,
        )),
    );
    await key("Enter");
    await shot("04-keyboard");
    await key("f", "meta");
    check(
      "⌘+F focuses the Panel's search",
      await ev(
        `document.activeElement?.getAttribute("aria-label") === "Filter"`,
      ),
    );
    await type("estimate");
    check(
      "search filters the table",
      (
        await until(app.rows, (rows) => rows.join() === "eth_estimateGas")
      ).join() === "eth_estimateGas",
    );
    await key("Escape");
    check(
      "Esc in the search box clears it",
      (await until(app.rows, (rows) => rows.length === 5)).length === 5,
    );
    for (const chainSearch of ["ethereum", "1"]) {
      await key("f", "meta");
      await type(chainSearch);
      // Give the search time to drop rows it does not match
      await app.sleep(300);
      check(
        `a search for the Chain's ${chainSearch === "1" ? "id" : "name"} keeps the rows`,
        (await app.rows()).length === 5,
        json(await app.rows()),
      );
      await key("Escape");
      await until(app.rows, (rows) => rows.length === 5);
    }
    // "1" also matches the host, so another Chain's name must drop every
    // row; an id could match the node's random port
    await key("f", "meta");
    await type("polygon");
    check(
      "a search for another Chain's name keeps no row",
      (await until(app.rows, (rows) => rows.length === 0)).length === 0,
      json(await app.rows()),
    );
    await key("Escape");
    await until(app.rows, (rows) => rows.length === 5);

    // Narrow Panel: the default side-docked DevTools is about 550 px wide
    if (!(await app.detailsOpen())) await clickRow({ method: "eth_call" });
    check(
      "every chip and Errors visible with the details open",
      await ev(`[...document.querySelectorAll(".rpc-table-chip, .rpc-table-errors")].every((e) => {
        const r = e.getBoundingClientRect(), c = e.closest(".rpc-table-toolbar").getBoundingClientRect();
        return r.width > 0 && r.right <= c.right + 1 && r.bottom <= c.bottom + 1; })`),
      `Panel ${await ev("innerWidth")} px`,
    );
    // Filtering eth_call out above closed its details
    if (!(await app.detailsOpen())) await clickRow({ method: "eth_call" });
    await click(".rpc-details-tab", "Contract");
    await click("button", "Delete");
    await click("button", "Yes, delete");
    check(
      "Contract deleted",
      !/USDC/.test(await textSoon((text) => !/USDC/.test(text))),
    );

    await app.page.reload();
    check(
      "reloading the inspected page clears the list",
      (await until(app.rows, (rows) => rows.length === 0)).length === 0,
    );

    // A Contract stored before the ABI moved into it (pre-7b26560)
    await ev(
      `chrome.storage.local.set({ contracts: { "${TOKEN}": { contractAddress: "${TOKEN}", name: "Old", abiId: "x" } } })`,
    );
    await app.traffic();
    check(
      "a legacy Contract in storage does not crash the Panel",
      (await until(app.rows, (rows) => rows.length === 5)).length === 5,
    );

    // Fetched from the fake Sourcify, without touching the Contract tab
    const callTo = (id, to) => ({
      jsonrpc: "2.0",
      id,
      method: "eth_call",
      params: [{ to, data: "0x70a08231" + pad(HOLDER) }, "latest"],
    });
    await app.rpc(callTo(6, WETH));
    check(
      "an eth_call to a verified address decodes as <name> / <function>",
      await callsContractSoon("WETH9", "balanceOf"),
    );
    await clickRow({ contract: "WETH9" });
    await click(".rpc-details-tab", "Contract");
    check(
      "the Contract tab says From Sourcify",
      /From Sourcify/.test(
        await textSoon((text) => /From Sourcify/.test(text)),
      ),
    );
    await shot("05-from-sourcify");
    check(
      "one Sourcify request per Chain and address",
      app.sourcifyUrls.length === 2,
      app.sourcifyUrls.join(", "),
    );

    // An Endpoint without a captured eth_chainId is asked by the Panel itself
    const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";
    await app.rpc(callTo(7, DAI), "/rpc2");
    // The Panel first waits 1 s for the page's own eth_chainId
    const ownChainIds = () =>
      app.nodeLog.filter(
        (r) =>
          r.origin.startsWith("chrome-extension://") &&
          r.path === "/rpc2" &&
          r.method === "eth_chainId",
      ).length;
    const daiFetched = () =>
      app.sourcifyUrls.some((url) => url.toLowerCase().includes(DAI));
    await until(() => ownChainIds() > 0 && daiFetched());
    // Time for a duplicate to show up
    await app.sleep(DUPLICATE_WINDOW);
    check(
      "the Panel asks an Endpoint for its chain id once",
      ownChainIds() === 1 && daiFetched(),
      JSON.stringify(app.nodeLog.filter((r) => r.path === "/rpc2")),
    );

    check(
      "without an Etherscan API key no Etherscan request is made",
      app.etherscanUrls.length === 0,
      app.etherscanUrls.join(", "),
    );

    // With a key, Etherscan is asked after a Sourcify 404
    const KEY = "SMOKETESTKEY123";
    await click(".rpc-table-settings-button");
    await click(".rpc-table-settings-field input");
    await type(KEY);
    const withKey = await until(
      () => ev(`chrome.storage.local.get("settings").then((s) => s.settings)`),
      (settings) => settings?.etherscanApiKey === KEY,
    );
    await shot("06-settings");
    check("the Etherscan API key is stored", withKey?.etherscanApiKey === KEY);
    // Closes the popover
    await click(".rpc-table-settings-button");
    await app.rpc(callTo(10, LINK));
    check(
      "an eth_call to an address verified on Etherscan only decodes",
      await callsContractSoon("LinkToken", "balanceOf"),
    );
    await app.sleep(DUPLICATE_WINDOW);
    check(
      "Etherscan asked once, after Sourcify, with the Chain, address and key",
      app.etherscanUrls.length === 1 &&
        app.etherscanUrls[0] ===
          `https://api.etherscan.io/v2/api?chainid=1&module=contract&action=getsourcecode&address=${LINK}&apikey=${KEY}` &&
        app.sourcifyUrls.some((url) => url.toLowerCase().includes(LINK)),
      app.etherscanUrls.join(", ").replaceAll(KEY, "<key>"),
    );
    await clickRow({ contract: "LinkToken" });
    await click(".rpc-details-tab", "Contract");
    check(
      "the Contract tab says From Etherscan",
      /From Etherscan/.test(
        await textSoon((text) => /From Etherscan/.test(text)),
      ),
    );
    await shot("07-from-etherscan");
    await app.rpc(callTo(11, UNVERIFIED));
    await clickRow({ contract: "0x2222...2222" });
    await click(".rpc-details-tab", "Contract");
    const missOnBoth = /No verified ABI on Sourcify or Etherscan/;
    check(
      "a miss on both says so in the Contract tab",
      missOnBoth.test(await textSoon((text) => missOnBoth.test(text))),
    );
    // React mirrors a controlled input's value into its attribute, so the
    // settings field itself is left out
    check(
      "the key is nowhere in the Panel's DOM outside the settings field",
      await ev(`(() => {
        const body = document.body.cloneNode(true);
        body
          .querySelectorAll(".rpc-table-settings-field input")
          .forEach((input) => input.remove());
        return !body.outerHTML.includes(${JSON.stringify(KEY)}) &&
          !document.body.innerText.includes(${JSON.stringify(KEY)});
      })()`),
    );

    // A proxy decodes with its implementation's ABI, saved at its own address
    await app.rpc(callTo(12, PROXY));
    check(
      "an eth_call to a proxy Sourcify resolves decodes as <impl name> / <function>",
      await callsContractSoon("FiatTokenV2_2", "balanceOf"),
    );
    await clickRow({ contract: "FiatTokenV2_2" });
    await click(".rpc-details-tab", "Contract");
    const viaProxy = /From Sourcify, via proxy/;
    check(
      "the Contract tab says From Sourcify, via proxy",
      viaProxy.test(await textSoon((text) => viaProxy.test(text))),
    );
    await shot("08-via-proxy");
    await app.rpc(callTo(13, SLOT_PROXY));
    check(
      "an eth_call to an EIP-1967 proxy decodes as <impl name> / <function>",
      await callsContractSoon("SlotToken", "balanceOf"),
    );
    check(
      "the Panel reads the EIP-1967 slot on the Endpoint",
      app.nodeLog.some(
        (r) =>
          r.origin.startsWith("chrome-extension://") &&
          r.method === "eth_getStorageAt",
      ),
    );
    const storedContracts = () =>
      ev(`chrome.storage.local.get("contracts").then((s) => s.contracts)`);
    await until(
      storedContracts,
      (contracts) => contracts?.[PROXY] && contracts?.[SLOT_PROXY],
    );
    // Time for a save at an implementation's own address to show up
    await app.sleep(DUPLICATE_WINDOW);
    const proxyContracts = await storedContracts();
    check(
      "proxy Contracts are saved at the proxy addresses only",
      proxyContracts?.[PROXY]?.proxy?.implementation === IMPLEMENTATION &&
        proxyContracts?.[SLOT_PROXY]?.proxy?.implementation ===
          SLOT_IMPLEMENTATION &&
        !proxyContracts?.[IMPLEMENTATION] &&
        !proxyContracts?.[SLOT_IMPLEMENTATION],
      JSON.stringify(Object.keys(proxyContracts ?? {})),
    );

    // A Multicall: named by the built-in aggregator ABI, its Inner Calls
    // listed in Params, decoded where the target has a Contract (WETH9)
    await app.rpc(MULTICALL_CALL);
    check(
      "a Multicall to an address without a Contract reads Multicall3 / aggregate3",
      await callsContractSoon("Multicall3", "aggregate3"),
    );
    // The Params' Inner Calls, as text
    const detailsInnerCalls = () =>
      ev(
        `[...document.querySelectorAll(".rpc-details-inner-call")].map((e) => e.innerText)`,
      );
    // MULTICALL_CALL is the first Multicall row, MULTICALL_FETCH_CALL the second
    await clickRow({ contract: "Multicall3" }, 0);
    await click(".rpc-details-tab", "Params");
    const innerCallsListed = (innerCalls) =>
      innerCalls?.length === 2 &&
      /^#1 WETH9 0xC02a…6Cc2\s+balanceOf\(account: 0x28C6c06298d514Db089934071355E5743bf21d60\)\s+→ 1000000$/.test(
        innerCalls[0],
      ) &&
      /^#2 0x2222…2222 ✗ Not allowed\s+0x12345678\s+No verified ABI[^\n]*\s+Add ABI$/.test(
        innerCalls[1],
      );
    const innerCalls = await until(detailsInnerCalls, innerCallsListed);
    check(
      "Params lists the Inner Calls, decoded with a result, the failed one ✗ with its revert message",
      innerCallsListed(innerCalls),
      JSON.stringify(innerCalls),
    );
    check(
      "the Multicall's raw decoded input is folded below the list",
      await ev(
        `document.querySelector(".rpc-details-collapsible")?.open === false`,
      ),
    );
    await shot("09-multicall");

    // Inner Call targets the Panel has not seen are fetched for the Multicall
    const beforeInner = app.sourcifyUrls.length;
    await app.rpc(MULTICALL_FETCH_CALL);
    const innerUrls = () =>
      app.sourcifyUrls.slice(beforeInner).map((url) => url.toLowerCase());
    const innerTargetsRequested = (urls) =>
      urls.some((url) => url.includes(`/1/${INNER_TOKEN}`)) &&
      urls.some((url) => url.includes(`/1/${INNER_UNVERIFIED}`));
    check(
      "a Multicall's Inner Call targets are requested from Sourcify",
      innerTargetsRequested(await until(innerUrls, innerTargetsRequested)),
      innerUrls().join(", "),
    );
    await clickRow({ contract: "Multicall3" }, 1);
    await click(".rpc-details-tab", "Params");
    const fetchedInnerListed = (innerCalls) =>
      innerCalls?.length === 2 &&
      /^#1 InnerToken 0x7777…7777\s+balanceOf\(account: 0x28C6c06298d514Db089934071355E5743bf21d60\)\s+→ 1000000$/.test(
        innerCalls[0],
      ) &&
      new RegExp(
        `^#2 0x8888…8888\\s+0x12345678\\s+→ ${INNER_RAW_RESULT}\\s+No verified ABI on Sourcify[^\\n]*\\s+Add ABI$`,
      ).test(innerCalls[1]);
    const fetchedInner = await until(detailsInnerCalls, fetchedInnerListed);
    check(
      "a fetched Inner Call target decodes in Params; an unverified one shows its raw result, its state and Add ABI",
      fetchedInnerListed(fetchedInner),
      JSON.stringify(fetchedInner),
    );
    await click(".rpc-details-inner-call button", "Add ABI");
    const innerContractTabShown = (text) =>
      text.includes(`Inner Call target ${INNER_UNVERIFIED}`) &&
      /No verified ABI on Sourcify/.test(text) &&
      /Fetch ABI/.test(text);
    const innerContractTab = await textSoon(innerContractTabShown);
    check(
      "Add ABI opens the Contract tab for the Inner Call target",
      (await ev(
        `document.querySelector(".rpc-details-tab-selected")?.innerText`,
      )) === "Contract" && innerContractTabShown(innerContractTab),
    );
    await shot("10-inner-call-contract");
    await clickRow({ contract: "Multicall3" }, 0);
    check(
      "selecting another RPC Request resets the Contract tab to its `to`",
      !/Inner Call target/.test(
        await textSoon((text) => !/Inner Call target/.test(text)),
      ),
    );

    // A Multicall stays a single row: Inner Calls are in its Params only.
    // MULTICALL_CALL is the first Multicall row, and the selected one
    const COUNTED_MULTICALL = /^eth_call · 2 · 1 ✗/;
    const noInnerCallRows = () =>
      ev(
        `!document.querySelector(".rpc-table-chevron, .rpc-table-body [role=row][aria-expanded], .rpc-table-body [role=row][aria-level]") && ![...document.querySelectorAll(".rpc-table-body [role=row]")].some((r) => /^#\\d/.test(r.innerText.trim()))`,
      );
    const selectedRowIndex = () =>
      ev(
        `[...document.querySelectorAll(".rpc-table-body [role=row]")].findIndex((r) => r.getAttribute("aria-selected") === "true")`,
      );
    await key("Escape");
    const multicallRow = await app.selected();
    check(
      "a Multicall row shows its Inner Call count and the failed ones', with no chevron and no aria-expanded",
      COUNTED_MULTICALL.test(multicallRow ?? "") && (await noInnerCallRows()),
      multicallRow,
    );
    const rowsBefore = await app.rows();
    await key("ArrowRight");
    await key("ArrowLeft");
    check(
      "→ and ← on the selected Multicall add no Inner Call rows",
      json(await app.rows()) === json(rowsBefore) &&
        (await app.selected()) === multicallRow &&
        (await noInnerCallRows()),
      json(await app.rows()),
    );
    await shot("11-multicall-row");
    const multicallIndex = await selectedRowIndex();
    await key("ArrowDown");
    const nextIndex = await selectedRowIndex();
    check(
      "↓ from the Multicall goes to the next RPC Request",
      nextIndex === multicallIndex + 1 &&
        (await app.selected()) === rowsBefore[multicallIndex + 1],
      `${multicallIndex} → ${nextIndex}`,
    );
    await key("ArrowUp");
    await key("Enter");
    await click(".rpc-details-tab", "Params");
    await key("f", "meta");
    await type("balanceOf");
    const searchedRows = await until(app.rows, (rows) =>
      rows?.some((row) => COUNTED_MULTICALL.test(row)),
    );
    check(
      "a search for an Inner Call's function shows the Multicall as a single row",
      searchedRows.filter((row) => COUNTED_MULTICALL.test(row)).length === 1 &&
        (await noInnerCallRows()),
      json(searchedRows),
    );
    await shot("12-inner-call-search");
    const searchedInnerCalls = await until(detailsInnerCalls, innerCallsListed);
    check(
      "Params still lists both Inner Calls, the failed one ✗ with its revert message",
      innerCallsListed(searchedInnerCalls),
      json(searchedInnerCalls),
    );
    await key("Escape");

    // With a key, Etherscan is asked when Sourcify fails too
    await app.rpc(callTo(14, SOURCIFY_DOWN));
    check(
      "an eth_call to an address Sourcify fails for decodes from Etherscan",
      (await callsContractSoon("DownToken", "balanceOf")) &&
        app.sourcifyUrls.some((url) =>
          url.toLowerCase().includes(SOURCIFY_DOWN),
        ) &&
        app.etherscanUrls.some((url) => url.includes(SOURCIFY_DOWN)),
    );
    await clickRow({ contract: "DownToken" });
    await click(".rpc-details-tab", "Contract");
    check(
      "the Contract tab says From Etherscan after a Sourcify failure",
      /From Etherscan/.test(
        await textSoon((text) => /From Etherscan/.test(text)),
      ),
    );
    await shot("14-sourcify-down");
    await key("Escape");

    // Settings: off means no Sourcify request, but the Panel still asks an
    // Endpoint without a captured eth_chainId for its Chain
    await click(".rpc-table-settings-button");
    await click(".rpc-table-settings .ant-checkbox-wrapper");
    const stored = await until(
      () => ev(`chrome.storage.local.get("settings").then((s) => s.settings)`),
      (settings) => settings?.fetchAbisAutomatically === false,
    );
    check(
      "the setting is stored off",
      stored?.fetchAbisAutomatically === false,
      JSON.stringify(stored),
    );
    const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
    const before = app.sourcifyUrls.length;
    await app.rpc(callTo(8, USDT), "/rpc3");
    await app.rpc(callTo(9, "0x1111111111111111111111111111111111111111"));
    const ownChainIdsOn3 = () =>
      app.nodeLog.filter(
        (r) =>
          r.origin.startsWith("chrome-extension://") &&
          r.path === "/rpc3" &&
          r.method === "eth_chainId",
      ).length;
    // The Panel first waits 1 s for the page's own eth_chainId, then asks
    await until(ownChainIdsOn3, (count) => count > 0);
    await app.sleep(DUPLICATE_WINDOW);
    check(
      "with the setting off no Sourcify request is made",
      app.sourcifyUrls.length === before,
      app.sourcifyUrls.slice(before).join(", "),
    );
    check(
      "with the setting off the Panel still asks an Endpoint for its chain id, once",
      ownChainIdsOn3() === 1,
      JSON.stringify(app.nodeLog.filter((r) => r.path === "/rpc3")),
    );
    // A search for the Endpoint's path leaves the /rpc3 call alone
    if (await app.detailsOpen()) await key("Escape");
    await key("f", "meta");
    await type("/rpc3");
    const rpc3Chain = (
      await until(
        app.rowChains,
        (chains) => chains.length === 1 && chains[0]?.[0] === "Ethereum",
      )
    )[0];
    await key("Escape");
    check(
      "an RPC Request to an Endpoint without a captured eth_chainId gets its Chain from the Panel's own",
      json(rpc3Chain) === json(["Ethereum", "Chain 1"]),
      json(rpc3Chain),
    );
    await shot("15-end");
    // Both bars, for a human to compare by eye
    if (bars)
      await app.stackShots("03-filter-bars", [
        ["Network", bars.network.shot],
        ["EVM RPC", bars.ours.shot],
      ]);
  } catch (e) {
    check("scenario ran to the end", false, e.message.split("\n")[0]);
    await shot("99-crash").catch(() => {});
  }
  const errors = app.errors();
  check(
    "no errors in the Panel",
    errors.length === 0,
    errors.slice(0, 3).join(" || "),
  );
  await app.close();
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(
    `\n${results.length - failed}/${results.length} passed · screenshots in ${OUT}`,
  );
  process.exit(failed ? 1 : 0);
}

const HELP = `commands (one per line):
  traffic                       send the standard RPC traffic from the dApp page
  rpc <json>                    send one request body, e.g. rpc {"jsonrpc":"2.0","id":9,"method":"eth_chainId"}
  click <selector> [@ text]     real click in the Panel, e.g. click .rpc-details-tab @ Contract
  clickrow <json> [n]           click the n-th (from 0) row whose method, contract and fn equal
                                the given ones, e.g. clickrow {"contract":"Multicall3"} 1
  key <key> [meta|ctrl|alt|shift...]   real key press, e.g. key f meta
  type <text>                   insert text into the focused field
  eval <js>                     evaluate in the Panel, prints JSON
  devtools <js>                 evaluate in the DevTools frontend
  rows | selected | drawer | closedrawer | errors
  ss <name>                     screenshot of DevTools to $OUT/<name>.png
  quit`;

async function repl() {
  const app = await launch();
  console.log(`ready · Panel loaded · screenshots in ${OUT}\n${HELP}`);
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    const [cmd, ...rest] = line.trim().split(" ");
    const arg = rest.join(" ");
    try {
      let out;
      if (cmd === "quit") break;
      else if (cmd === "traffic") out = (await app.traffic(), await app.rows());
      else if (cmd === "rpc") out = await app.rpc(JSON.parse(arg));
      else if (cmd === "click") {
        const [selector, text] = arg.split(" @ ");
        out = await app.click(selector, text);
      } else if (cmd === "clickrow") {
        const [, match, n] = arg.match(/^(\{.*\})\s*(\d*)$/) ?? [];
        out = await app.clickRow(JSON.parse(match ?? "null"), Number(n || 0));
      } else if (cmd === "key") out = await app.key(rest[0], ...rest.slice(1));
      else if (cmd === "type") out = await app.type(arg);
      else if (cmd === "eval") out = await app.ev(arg);
      else if (cmd === "devtools") out = await app.devtools.evaluate(arg);
      else if (cmd === "rows") out = await app.rows();
      else if (cmd === "selected") out = await app.selected();
      else if (cmd === "drawer") out = await app.drawerOpen();
      else if (cmd === "closedrawer") out = await app.closeDrawer();
      else if (cmd === "errors") out = app.errors();
      else if (cmd === "ss") out = await app.shot(arg || "shot");
      else if (cmd) out = HELP;
      console.log(
        out === undefined
          ? "ok"
          : typeof out === "string"
            ? out
            : JSON.stringify(out),
      );
    } catch (e) {
      console.log("error: " + e.message.split("\n")[0]);
    }
  }
  await app.close();
}

// Run as a script; imported, it only exports launch() and the fixtures
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === "smoke") await smoke();
  else if (mode === "repl") await repl();
  else {
    console.error("usage: driver.mjs smoke | repl");
    process.exit(2);
  }
}
