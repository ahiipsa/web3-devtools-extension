// DevTools injects a keydown listener on the Panel's document that forwards
// Esc and Ctrl/⌘ shortcuts to DevTools itself (Esc toggles its drawer, Ctrl/⌘+F
// opens its search) and prevents their default. A Panel shortcut therefore
// listens on window in the capture phase, ahead of it, and stops the event
// once handled.
//
// `handle` returns whether it handled the event. Returns the cleanup.
export const addPanelShortcut = (
  handle: (event: KeyboardEvent) => boolean,
): (() => void) => {
  const listener = (event: KeyboardEvent) => {
    if (handle(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  window.addEventListener("keydown", listener, true);
  return () => window.removeEventListener("keydown", listener, true);
};
