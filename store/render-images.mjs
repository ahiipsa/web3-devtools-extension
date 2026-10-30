// Renders the Chrome Web Store screenshots and promo tiles from store/designs/:
//   npm run store-images
// Each design is captured at 2× and scaled down to its exact size with `sips`
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const STORE = new URL("./", import.meta.url).pathname;
const IMAGES = [
  ["1-inspect", "screenshots/1-inspect.png", 1280, 800],
  ["2-decode", "screenshots/2-decode.png", 1280, 800],
  ["3-multicall", "screenshots/3-multicall.png", 1280, 800],
  ["4-reverts", "screenshots/4-reverts.png", 1280, 800],
  ["5-abi", "screenshots/5-abi.png", 1280, 800],
  ["promo-small", "promo-small.png", 440, 280],
  ["promo-marquee", "promo-marquee.png", 1400, 560],
];

const raw = mkdtempSync(join(tmpdir(), "evm-rpc-store-"));
const browser = await chromium.launch();

try {
  for (const [design, out, width, height] of IMAGES) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 2,
    });
    await page.goto("file://" + join(STORE, "designs", design + ".html"));
    const full = join(raw, design + ".png");
    await page.screenshot({ path: full });
    await page.close();
    execFileSync(
      "sips",
      ["-z", String(height), String(width), full, "--out", join(STORE, out)],
      { stdio: "ignore" },
    );
    console.log("saved", join(STORE, out));
  }
} finally {
  await browser.close();
}
