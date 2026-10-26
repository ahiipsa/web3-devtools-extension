import { describe, expect, it } from "vitest";
import { buildManifest } from "./manifest.ts";

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
});
