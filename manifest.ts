// Source of build/manifest.json; emitted by the manifest plugin in vite.config.ts
export const buildManifest = (pkg: { version: string }) => ({
  manifest_version: 3,
  name: "EVM RPC Inspector",
  version: pkg.version,
  description: "Inspect and decode EVM JSON-RPC calls in Chrome DevTools",
  action: {
    default_popup: "popup.html",
  },
  devtools_page: "devtools.html",
  permissions: ["storage"],
});
