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
import { chromium } from "playwright-core";
import http from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

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

// Verified on the fake Sourcify; any other address answers 404
export const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
export const SOURCIFY = {
  [WETH]: { abi: BALANCE_OF_ABI, compilation: { name: "WETH9" } },
};

// The mock node's answer per method; anything else gets `result: null`
const ANSWERS = {
  eth_chainId: { result: "0x1" },
  eth_blockNumber: { result: "0x1406f40" },
  eth_getBalance: { result: "0xde0b6b3a7640000" },
  eth_call: { result: "0x" + pad("f4240") }, // 1000000
  eth_estimateGas: { error: { code: 3, message: "execution reverted" } },
};

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
          ...(ANSWERS[r.method] ?? { result: null }),
        });
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify(Array.isArray(parsed) ? parsed.map(one) : one(parsed)),
        );
      });
    });
    server.listen(0, "127.0.0.1", () => ready(server));
  });

// Minimal CDP client over a target's own websocket
const connectTarget = async (cdpPort, match) => {
  for (let i = 0; i < 50; i++) {
    const targets = await (
      await fetch(`http://127.0.0.1:${cdpPort}/json`)
    ).json();
    const target = targets.find((t) => match(t.url));
    if (target) {
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((ok, fail) => ((ws.onopen = ok), (ws.onerror = fail)));
      let id = 0;
      const pending = new Map();
      const events = [];
      const handlers = new Map();
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id && pending.has(d.id)) {
          pending.get(d.id)(d);
          pending.delete(d.id);
        } else if (d.method) {
          events.push(d);
          handlers.get(d.method)?.(d.params);
        }
      };
      const send = (method, params = {}) =>
        new Promise((ok) => {
          const i = ++id;
          pending.set(i, ok);
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
// Answers the Panel's requests to https://sourcify.dev/* from SOURCIFY, so
// nothing reaches the real Sourcify; returns the URLs it was asked for
const interceptSourcify = async (panel) => {
  const urls = [];
  panel.on("Fetch.requestPaused", ({ requestId, request }) => {
    urls.push(request.url);
    const address = /\/contract\/\d+\/(0x[0-9a-fA-F]{40})/
      .exec(request.url)?.[1]
      ?.toLowerCase();
    const fixture = SOURCIFY[address];
    const body = fixture ?? {
      error: "Contract not found",
      customCode: "not_found",
    };
    panel.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: fixture ? 200 : 404,
      responseHeaders: [
        { name: "content-type", value: "application/json" },
        { name: "access-control-allow-origin", value: "*" },
      ],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    });
  });
  await panel.send("Fetch.enable", {
    patterns: [{ urlPattern: "https://sourcify.dev/*" }],
  });
  return urls;
};

const LEGACY = `(async () => (await import("./ui/legacy/legacy.js")).InspectorView.InspectorView.instance())()`;

export async function launch() {
  const node = await startNode();
  const origin = `http://127.0.0.1:${node.address().port}`;
  const profile = mkdtempSync(join(tmpdir(), "evm-rpc-profile-"));
  const context = await chromium.launchPersistentContext(profile, {
    // DevTools never open in headless mode, so the window is real, just off screen
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      "--auto-open-devtools-for-tabs",
      "--remote-debugging-port=0",
      // DevTools follow the system scheme; this forces light (themeName "default")
      ...(process.env.LIGHT ? ["--blink-settings=preferredColorScheme=1"] : []),
      ...(process.env.HEADED ? [] : ["--window-position=-3000,-3000"]),
    ],
    viewport: { width: 1200, height: 800 },
  });
  const cdpPort = readFileSync(
    join(profile, "DevToolsActivePort"),
    "utf8",
  ).split("\n")[0];
  const page = context.pages()[0] ?? (await context.newPage());
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
  const sourcifyUrls = await interceptSourcify(panel);
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
    // Requests the Panel sent to the fake Sourcify, and that the node got
    sourcifyUrls,
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
      await context.close();
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
  const { click, key, type, shot, ev } = app;
  try {
    await shot("01-empty");
    await app.traffic();
    const rows = await app.rows();
    check(
      "captures real traffic: batch split, non-RPC POST skipped",
      rows.length === 5,
      rows.join(", "),
    );
    await shot("02-table");

    await click(".rpc-table-body [role=row]:nth-child(4)");
    check(
      "click opens the details",
      (await app.detailsOpen()) && (await app.selected()) === "eth_call",
    );
    await click(".rpc-details-tab", "Contract");
    await app.sleep(300);
    const contractTab = await app.text();
    check(
      "a 404 from Sourcify shows no verified ABI and Fetch ABI",
      /No verified ABI on Sourcify/.test(contractTab) &&
        /Fetch ABI/.test(contractTab),
    );
    check(
      "Sourcify asked once for the called address on the captured Chain",
      app.sourcifyUrls.join() ===
        "https://sourcify.dev/server/v2/contract/1/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48?fields=abi,compilation",
      app.sourcifyUrls.join(", "),
    );
    await click(".rpc-details input");
    await type("USDC");
    await click(".rpc-details textarea");
    await type(JSON.stringify(BALANCE_OF_ABI));
    await click("button", "Save");
    await app.sleep(400);
    await click(".rpc-details-tab", "Params");
    const params = await app.text();
    check(
      "Contract saved, input decoded with named arguments",
      /balanceOf\(address account\)/.test(params) &&
        /account\s+address\s+0x28C6/i.test(params),
    );
    await shot("03-params-decoded");
    await click(".rpc-details-tab", "Response");
    check(
      "return value decoded by name",
      /balance\s+uint256\s+1000000/.test(await app.text()),
    );
    check(
      "table row names Contract and function",
      /USDC \/ balanceOf|USDC\s+balanceOf/.test(await app.text()),
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
    await key("Enter");
    check("Enter reopens the details", await app.detailsOpen());
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
    await click(".rpc-table-body [role=row]:nth-child(4)");
    await click(".rpc-table-body [role=row]:nth-child(4)");
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
      (await app.rows()).join() === "eth_estimateGas",
    );
    await key("Escape");
    check("Esc in the search box clears it", (await app.rows()).length === 5);

    // Narrow Panel: the default side-docked DevTools is about 550 px wide
    if (!(await app.detailsOpen()))
      await click(".rpc-table-body [role=row]:nth-child(4)");
    check(
      "every chip and Errors visible with the details open",
      await ev(`[...document.querySelectorAll(".rpc-table-chip, .rpc-table-errors")].every((e) => {
        const r = e.getBoundingClientRect(), c = e.closest(".rpc-table-toolbar").getBoundingClientRect();
        return r.width > 0 && r.right <= c.right + 1 && r.bottom <= c.bottom + 1; })`),
      `Panel ${await ev("innerWidth")} px`,
    );
    // Filtering eth_call out above closed its details
    if (!(await app.detailsOpen()))
      await click(".rpc-table-body [role=row]:nth-child(4)");
    await click(".rpc-details-tab", "Contract");
    await click("button", "Delete");
    await click("button", "Yes, delete");
    await app.sleep(400);
    check("Contract deleted", !/USDC/.test(await app.text()));

    await app.page.reload();
    await app.sleep(800);
    check(
      "reloading the inspected page clears the list",
      (await app.rows()).length === 0,
    );

    // A Contract stored before the ABI moved into it (pre-7b26560)
    await ev(
      `chrome.storage.local.set({ contracts: { "${TOKEN}": { contractAddress: "${TOKEN}", name: "Old", abiId: "x" } } })`,
    );
    await app.traffic();
    check(
      "a legacy Contract in storage does not crash the Panel",
      (await app.rows()).length === 5,
    );

    // Fetched from the fake Sourcify, without touching the Contract tab
    const callTo = (id, to) => ({
      jsonrpc: "2.0",
      id,
      method: "eth_call",
      params: [{ to, data: "0x70a08231" + pad(HOLDER) }, "latest"],
    });
    await app.rpc(callTo(6, WETH));
    await app.sleep(600);
    check(
      "an eth_call to a verified address decodes as <name> / <function>",
      /WETH9 \/ balanceOf|WETH9\s+balanceOf/.test(await app.text()),
    );
    await click(".rpc-table-body [role=row]:nth-child(6)");
    await click(".rpc-details-tab", "Contract");
    check(
      "the Contract tab says From Sourcify",
      /From Sourcify/.test(await app.text()),
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
    await app.sleep(600);
    check(
      "the Panel asks an Endpoint for its chain id once",
      app.nodeLog.filter(
        (r) => r.origin.startsWith("chrome-extension://") && r.path === "/rpc2",
      ).length === 1 &&
        app.sourcifyUrls.some((url) => url.toLowerCase().includes(DAI)),
      JSON.stringify(app.nodeLog.filter((r) => r.path === "/rpc2")),
    );

    // Settings: off means no Sourcify request and no eth_chainId of its own
    await click(".rpc-table-settings-button");
    await shot("06-settings");
    await click(".rpc-table-settings .ant-checkbox-wrapper");
    const stored = await ev(
      `chrome.storage.local.get("settings").then((s) => s.settings)`,
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
    await app.sleep(600);
    check(
      "with the setting off no Sourcify request is made",
      app.sourcifyUrls.length === before &&
        !app.nodeLog.some(
          (r) =>
            r.origin.startsWith("chrome-extension://") && r.path === "/rpc3",
        ),
      app.sourcifyUrls.slice(before).join(", "),
    );
    await shot("07-end");
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
                                or click .rpc-table-body [role=row]:nth-child(2)
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
