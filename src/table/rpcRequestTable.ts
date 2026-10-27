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
  InnerCallRow,
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

// With the details open the table keeps only Method, at the full width of its
// side of the split, in the same single-line rows; a row's tooltip tells what
// is hidden
const HIDDEN_WITH_DETAILS: VisibilityState = {
  contract: false,
  function: false,
  status: false,
  endpoint: false,
  time: false,
};

const ALL_VISIBLE: VisibilityState = {};

export const getColumnVisibility = (detailsOpen: boolean): VisibilityState =>
  detailsOpen ? HIDDEN_WITH_DETAILS : ALL_VISIBLE;

// The Contract and Function lines, leaving out what the row has none of
const formatContractCall = (
  contractLabel: string | undefined,
  functionFields: Parameters<typeof getFunctionLabel>[0],
) => {
  const functionLabel = getFunctionLabel(functionFields);
  return [
    contractLabel && `Contract: ${contractLabel}`,
    functionLabel && `Function: ${functionLabel.text}`,
  ].filter((line): line is string => !!line);
};

export const formatHiddenWithDetails = (
  row: Pick<
    RpcRequestRow,
    | "contractLabel"
    | "functionName"
    | "functionSelector"
    | "status"
    | "endpoint"
    | "time"
  >,
) =>
  [
    ...formatContractCall(row.contractLabel, row),
    `Status: ${row.status}`,
    `Endpoint: ${row.endpoint}`,
    `Time: ${formatDuration(row.time)}`,
  ].join("\n");

// An Inner Call has no Status, Endpoint or Time of its own
export const formatInnerCallHiddenWithDetails = (innerCall: InnerCallRow) =>
  formatContractCall(innerCall.contractLabel, innerCall).join("\n");
