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
  // Chain names and bare chain ids sort together as text
  column.accessor("chainLabel", {
    id: "chain",
    ...textColumn,
    header: "Chain",
    size: 90,
  }),
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

// With the details open the table keeps only Method, at the full width of its
// side of the split, in the same single-line rows; a row's tooltip tells what
// is hidden
const HIDDEN_WITH_DETAILS: VisibilityState = {
  chain: false,
  contract: false,
  function: false,
  status: false,
  endpoint: false,
  time: false,
};

const ALL_VISIBLE: VisibilityState = {};

export const getColumnVisibility = (detailsOpen: boolean): VisibilityState =>
  detailsOpen ? HIDDEN_WITH_DETAILS : ALL_VISIBLE;

// Leaves out the Chain, Contract and Function a row has none of
export const formatHiddenWithDetails = (
  row: Pick<
    RpcRequestRow,
    | "chainLabel"
    | "contractLabel"
    | "functionName"
    | "functionSelector"
    | "status"
    | "endpoint"
    | "time"
  >,
) => {
  const functionLabel = getFunctionLabel(row);
  return [
    row.chainLabel && `Chain: ${row.chainLabel}`,
    row.contractLabel && `Contract: ${row.contractLabel}`,
    functionLabel && `Function: ${functionLabel.text}`,
    `Status: ${row.status}`,
    `Endpoint: ${row.endpoint}`,
    `Time: ${formatDuration(row.time)}`,
  ]
    .filter(Boolean)
    .join("\n");
};
