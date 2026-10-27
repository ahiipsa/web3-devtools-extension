// WheelEvent.deltaMode: DOM_DELTA_PIXEL, DOM_DELTA_LINE, DOM_DELTA_PAGE
const DELTA_MODE_LINE = 1;
const DELTA_MODE_PAGE = 2;
const LINE_HEIGHT_PX = 16;

// A mouse wheel only scrolls vertically, so the tab bar, which scrolls
// sideways, turns it into a horizontal scroll. A horizontal trackpad swipe
// already scrolls the bar natively and is left to the browser (null).
export function getTabBarScrollDelta(
  {
    deltaX,
    deltaY,
    deltaMode,
  }: Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode">,
  barWidth: number,
): number | null {
  if (deltaY === 0 || Math.abs(deltaX) >= Math.abs(deltaY)) {
    return null;
  }
  switch (deltaMode) {
    case DELTA_MODE_LINE:
      return deltaY * LINE_HEIGHT_PX;
    case DELTA_MODE_PAGE:
      return deltaY * barWidth;
    default:
      return deltaY;
  }
}
