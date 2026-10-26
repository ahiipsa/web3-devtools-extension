import { ColumnSizingState } from "@tanstack/react-table";

// Kept in the Panel's localStorage, so widths survive closing DevTools
const COLUMN_SIZING_KEY = "rpcRequestTable.columnSizing";

type SizingStorage = Pick<Storage, "getItem" | "setItem">;

export function loadColumnSizing(storage: SizingStorage): ColumnSizingState {
  let saved: unknown;
  try {
    saved = JSON.parse(storage.getItem(COLUMN_SIZING_KEY) ?? "{}");
  } catch {
    return {};
  }
  if (typeof saved !== "object" || saved === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(saved).filter(
      ([, width]) => typeof width === "number" && width > 0,
    ),
  );
}

export function saveColumnSizing(
  storage: SizingStorage,
  sizing: ColumnSizingState,
) {
  storage.setItem(COLUMN_SIZING_KEY, JSON.stringify(sizing));
}
