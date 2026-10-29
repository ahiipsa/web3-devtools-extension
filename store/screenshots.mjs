// Takes the Chrome Web Store screenshots (1280×800) of the Panel on real dApps,
// with the real Sourcify. Run after `npm run build`:
//   WINDOW_SIZE=1440,870 node store/screenshots.mjs
// DevTools are docked right at 1170×731 CSS px (16:10, the most a 900 px tall
// screen leaves), captured at 2× and scaled down to 1280×800 with `sips`
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch } from "../.claude/skills/run-evm-rpc-inspector/driver.mjs";

const OUT = new URL("./screenshots/", import.meta.url).pathname;
const DEVTOOLS_WIDTH = 1170;
const raw = mkdtempSync(join(tmpdir(), "evm-rpc-store-"));

const app = await launch({ realAbiSources: true });
// DevTools internals, as in the driver
const LEGACY = `(await import("./ui/legacy/legacy.js")).InspectorView.InspectorView.instance()`;

const shot = async (name) => {
  await app.sleep(800);
  const [width, height] = await app.devtools.evaluate(
    "[innerWidth, innerHeight]",
  );
  const { result } = await app.devtools.send("Page.captureScreenshot", {
    format: "png",
  });
  const full = join(raw, name + ".png");
  const cropped = join(raw, name + "-cropped.png");
  writeFileSync(full, Buffer.from(result.data, "base64"));
  // DevTools take the right DEVTOOLS_WIDTH px of the window, at 2×
  execFileSync(
    "sips",
    [
      "-c",
      String(height * 2),
      String(DEVTOOLS_WIDTH * 2),
      "--cropOffset",
      "0",
      String((width - DEVTOOLS_WIDTH) * 2),
      full,
      "--out",
      cropped,
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "sips",
    ["-z", "800", "1280", cropped, "--out", join(OUT, name + ".png")],
    { stdio: "ignore" },
  );
  console.log("saved", join(OUT, name + ".png"));
};

const open = async (url, settle = 15_000) => {
  await app.page.goto(url, { waitUntil: "domcontentloaded" });
  await app.sleep(settle);
};

try {
  // Docked right, DevTools are the sidebar of the window's root split; the
  // extra px is the split's resizer
  await app.devtools.evaluate(
    `(async () => { ${LEGACY}.parentWidget().setSidebarSize(${DEVTOOLS_WIDTH + 1}); return 1 })()`,
  );

  await open("https://www.curve.finance/dex/ethereum/pools/");
  await shot("1-table");
  await app.clickRow({
    method: "eth_call",
    contract: "CurveFactory",
    fn: "gauge_implementation",
  });
  await shot("2-overview");
  await app.click(".rpc-details-tab", "Response");
  await shot("3-response");
  await app.click(".rpc-details-tab", "Contract");
  await shot("5-contract");

  await open("https://app.ens.domains/vitalik.eth");
  // The aggregate3 call with the most Inner Calls: its Method cell reads
  // `eth_call · <Inner Calls>`, and Method, Contract and Function are the 1st,
  // 3rd and 4th cells
  const MULTICALL = {
    method: "eth_call",
    contract: "Multicall3",
    fn: "aggregate3",
  };
  const innerCalls = (await app.rowCells())
    .filter(
      ([method, , contract, fn]) =>
        method.split(" ")[0] === MULTICALL.method &&
        contract === MULTICALL.contract &&
        fn === MULTICALL.fn,
    )
    .map(([method]) => Number(method.match(/· (\d+)/)?.[1] ?? 0));
  await app.clickRow(MULTICALL, innerCalls.indexOf(Math.max(...innerCalls)));
  // The page's own console errors would show as a badge in the DevTools toolbar;
  // requestClearMessages takes the TargetManager in Chromium 156's DevTools
  await app.devtools.evaluate(
    `(async () => { const { ConsoleModel, TargetManager } = await import("./core/sdk/sdk.js"); ConsoleModel.ConsoleModel.requestClearMessages(TargetManager.TargetManager.instance()); return 1 })()`,
  );
  await app.click(".rpc-details-tab", "Params");
  await shot("4-multicall");
} finally {
  await app.close();
}
