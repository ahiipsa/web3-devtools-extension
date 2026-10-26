// Kept in the Panel's localStorage, so the split survives closing DevTools
const TABLE_WIDTH_KEY = "rpcRequestDetails.tableWidth";

// Match .rpc-details-table in RequestDetails.css
const MIN_TABLE_WIDTH = 120;
const MIN_DETAILS_WIDTH = 240;

type SplitStorage = Pick<Storage, "getItem" | "setItem">;

// The table's width in pixels while the details are open; null until dragged
export function loadTableWidth(storage: SplitStorage): number | null {
  const width = Number(storage.getItem(TABLE_WIDTH_KEY));
  return Number.isFinite(width) && width > 0 ? width : null;
}

export function saveTableWidth(storage: SplitStorage, width: number) {
  storage.setItem(TABLE_WIDTH_KEY, String(width));
}

export function clampTableWidth(width: number, panelWidth: number) {
  return Math.max(
    MIN_TABLE_WIDTH,
    Math.min(width, panelWidth - MIN_DETAILS_WIDTH),
  );
}
