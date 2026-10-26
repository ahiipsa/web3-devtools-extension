import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pkg from "./package.json";
import { buildManifest } from "./manifest.ts";

const ICON_SIZES = ["16", "48", "128"];

// Extension files are served from public/ as-is
const readPublic = (path: string) =>
  readFileSync(new URL(`./public/${path}`, import.meta.url));

// Width and height live in the IHDR chunk, right after the 8-byte signature
const pngSize = (png: Buffer) => ({
  width: png.readUInt32BE(16),
  height: png.readUInt32BE(20),
});

describe("buildManifest", () => {
  it("takes the version from package.json", () => {
    expect(buildManifest({ version: "1.2.3" }).version).toBe("1.2.3");
  });

  it("carries the product name and description", () => {
    const manifest = buildManifest({ version: "1.2.3" });
    expect(manifest.name).toBe("EVM RPC Inspector");
    expect(manifest.description).toBe(
      "Inspect and decode EVM JSON-RPC calls in Chrome DevTools",
    );
  });

  it("requests only the storage permission and no host access", () => {
    const manifest = buildManifest({ version: "1.2.3" });
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest).not.toHaveProperty("background");
  });

  it("points the extension and toolbar icons at PNGs of the declared size", () => {
    const manifest = buildManifest(pkg);
    for (const icons of [manifest.icons, manifest.action.default_icon]) {
      expect(Object.keys(icons)).toEqual(ICON_SIZES);
      for (const [size, path] of Object.entries(icons)) {
        expect(pngSize(readPublic(path))).toEqual({
          width: Number(size),
          height: Number(size),
        });
      }
    }
  });

  it("points the toolbar popup at an existing page", () => {
    const manifest = buildManifest(pkg);
    expect(() => readPublic(manifest.action.default_popup)).not.toThrow();
  });
});
