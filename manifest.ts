// Source of build/manifest.json; emitted by the manifest plugin in vite.config.ts
const icons = {
  "16": "icons/icon-16.png",
  "48": "icons/icon-48.png",
  "128": "icons/icon-128.png",
};

export const buildManifest = (pkg: { version: string }) => ({
  manifest_version: 3,
  name: "EVM RPC Inspector",
  version: pkg.version,
  description: "Inspect and decode EVM JSON-RPC calls in Chrome DevTools",
  icons,
  action: {
    default_icon: icons,
    default_popup: "popup.html",
  },
  devtools_page: "devtools.html",
  permissions: ["storage"],
});
