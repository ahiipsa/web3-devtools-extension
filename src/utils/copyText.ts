// Puts text on the clipboard. The DevTools Panel is a frame of the DevTools
// window that is not granted clipboard-write, so the async Clipboard API is
// refused there; a copy command on a hidden textarea still works in response
// to the user's click
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall back to the copy command below
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  const focused = document.activeElement;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("The copy command was refused");
    }
  } finally {
    textarea.remove();
    if (focused instanceof HTMLElement) {
      focused.focus();
    }
  }
}
