import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  TableOptions,
  VisibilityState,
} from "@tanstack/react-table";
import {
  formatDuration,
  getFunctionLabel,
  RpcRequestRow,
} from "./rpcRequestRow.ts";

const column = createColumnHelper<RpcRequestRow>();

const textColumn = {
  sortingFn: "alphanumeric",
  sortUndefined: "last",
  cell: (info: { getValue: () => unknown }) => info.getValue() ?? "",
} as const;

export const rpcRequestColumns = [
  column.accessor("method", { ...textColumn, header: "Method", size: 160 }),
  column.accessor("contractLabel", {
    id: "contract",
    ...textColumn,
    header: "Contract",
    size: 140,
  }),
  // Names and selectors sort together; the Panel mutes the selectors
  column.accessor((row) => getFunctionLabel(row)?.text, {
    ...textColumn,
    id: "function",
    header: "Function",
    size: 140,
  }),
  column.accessor("status", { ...textColumn, header: "Status", size: 80 }),
  column.accessor("endpoint", { ...textColumn, header: "Endpoint", size: 160 }),
  column.accessor("time", {
    header: "Time",
    size: 70,
    sortingFn: "basic",
    cell: (info) => formatDuration(info.getValue()),
  }),
];

// Everything but data and state, shared by the Panel and the tests.
// Clicking a header cycles ascending → descending → arrival order (no sorting).
export const rpcRequestTableOptions = {
  columns: rpcRequestColumns,
  getRowId: (row) => row.request.id,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  sortDescFirst: false,
  enableSortingRemoval: true,
  enableMultiSort: false,
  columnResizeMode: "onChange",
  defaultColumn: { minSize: 40 },
} satisfies Omit<TableOptions<RpcRequestRow>, "data">;

// With the details open the table keeps Method, Contract and Function, the
// same single-line rows; a row's tooltip tells what is hidden
const HIDDEN_WITH_DETAILS: VisibilityState = {
  status: false,
  endpoint: false,
  time: false,
};

const ALL_VISIBLE: VisibilityState = {};

export const getColumnVisibility = (detailsOpen: boolean): VisibilityState =>
  detailsOpen ? HIDDEN_WITH_DETAILS : ALL_VISIBLE;

// With the details open, columns that do not fit the table's side of the split
// give way from the last: Function first, then Contract, then Method. Flex
// shrinks by factor × width, so factors this far apart act as an order.
const SHRINK_WITH_DETAILS: Record<string, number> = {
  method: 1,
  contract: 1e3,
  function: 1e6,
};

export const getShrinkWithDetails = (columnId: string) =>
  SHRINK_WITH_DETAILS[columnId] ?? 0;

export const formatHiddenWithDetails = (
  row: Pick<RpcRequestRow, "status" | "endpoint" | "time">,
) =>
  [
    `Status: ${row.status}`,
    `Endpoint: ${row.endpoint}`,
    `Time: ${formatDuration(row.time)}`,
  ].join("\n");
