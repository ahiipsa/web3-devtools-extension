// Fractional scroll offsets on zoomed or HiDPI screens can stop short of the end
const TOLERANCE_PX = 2;

export function isScrolledToBottom({
  scrollTop,
  clientHeight,
  scrollHeight,
}: Pick<Element, "scrollTop" | "clientHeight" | "scrollHeight">) {
  return scrollHeight - scrollTop - clientHeight <= TOLERANCE_PX;
}
