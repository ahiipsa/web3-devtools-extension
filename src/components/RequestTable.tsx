import "./RequestTable.css";
import cx from "classnames";
import {
  ColumnSizingState,
  flexRender,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppContext } from "./AppContext.tsx";
import { useRpcRequestRows } from "../hooks/useRpcRequestRows.ts";
import { rpcRequestTableOptions } from "../table/rpcRequestTable.ts";
import {
  loadColumnSizing,
  saveColumnSizing,
} from "../table/columnSizingStorage.ts";
import { isScrolledToBottom } from "../table/isScrolledToBottom.ts";
import {
  buildRpcRequestLines,
  emptyExpansion,
  getLineKeyAction,
  getSelectedLineId,
  LineKey,
  RpcRequestLine,
  setExpanded,
} from "../table/rpcRequestLines.ts";
import {
  matchesRpcRequestFilter,
  RpcRequestFilter,
} from "../table/rpcRequestFilter.ts";
import {
  formatCollapsedSubtitle,
  formatContractCall,
  getFunctionLabel,
  InnerCallRow,
  RpcRequestRow,
} from "../table/rpcRequestRow.ts";

// Match --rpc-table-row-height and .rpc-table-collapsed in RequestTable.css
const ROW_HEIGHT = 21;
const COLLAPSED_ROW_HEIGHT = 34;

const COLLAPSED_COLUMNS: VisibilityState = {
  contract: false,
  function: false,
  status: false,
  endpoint: false,
  time: false,
};

const SORT_ARROWS = { asc: "▲", desc: "▼" } as const;
const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

const LINE_KEYS = new Set<string>([
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
  "ArrowLeft",
  "ArrowRight",
] satisfies LineKey[]);

// Contract / function, as formatContractCall, with an undecoded selector muted
const ContractCall = ({
  call,
}: {
  call: Parameters<typeof formatContractCall>[0];
}) => {
  const functionLabel = getFunctionLabel(call);
  return (
    <>
      {call.contractLabel}
      {functionLabel && " / "}
      {functionLabel && (
        <span className={cx({ "rpc-table-muted": !functionLabel.decoded })}>
          {functionLabel.text}
        </span>
      )}
    </>
  );
};

// The second line of a collapsed row, as formatCollapsedSubtitle: the Endpoint's
// host muted, else Contract / function
const CollapsedSubtitle = ({ row }: { row: RpcRequestRow }) =>
  row.contractLabel ? (
    <ContractCall call={row} />
  ) : (
    <span className="rpc-table-muted">{row.endpoint}</span>
  );

// A Multicall's Inner Call count, and its failed ones' if any: ` · 12 · 2 ✗`
const countInnerCalls = (innerCalls: InnerCallRow[]) => ({
  total: ` · ${innerCalls.length}`,
  failed: innerCalls.some((innerCall) => innerCall.failed)
    ? ` · ${innerCalls.filter((innerCall) => innerCall.failed).length} ✗`
    : "",
});

const formatInnerCallCount = (innerCalls: InnerCallRow[]) => {
  const { total, failed } = countInnerCalls(innerCalls);
  return total + failed;
};

// The method, after a Multicall's chevron and before its Inner Call count
const MethodLabel = (props: {
  line: Extract<RpcRequestLine, { kind: "rpcRequest" }>;
  onToggle: () => void;
}) => {
  const { line, onToggle } = props;
  const { innerCalls } = line.row;
  return (
    <>
      {line.expandable && (
        <span
          className="rpc-table-chevron"
          aria-hidden
          // Expands or collapses only; the row is not selected
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          {line.expanded ? "▾" : "▸"}
        </span>
      )}
      {line.row.method}
      {innerCalls && (
        <>
          <span className="rpc-table-muted">
            {countInnerCalls(innerCalls).total}
          </span>
          <span className="rpc-table-failed-mark">
            {countInnerCalls(innerCalls).failed}
          </span>
        </>
      )}
    </>
  );
};

// An Inner Call line's label: Contract / function, ✗ when it failed
const InnerCallLabel = ({ innerCall }: { innerCall: InnerCallRow }) => (
  <>
    <ContractCall call={innerCall} />
    {innerCall.failed && <span className="rpc-table-failed-mark"> ✗</span>}
  </>
);

const formatInnerCallLabel = (innerCall: InnerCallRow) =>
  formatContractCall(innerCall) + (innerCall.failed ? " ✗" : "");

interface RequestTableProps {
  filter: RpcRequestFilter;
  // The focusable grid, which also scrolls the rows
  scrollRef: React.RefObject<HTMLDivElement>;
}

export const RequestTable = ({ filter, scrollRef }: RequestTableProps) => {
  const appContext = useContext(AppContext);
  const data = useRpcRequestRows(appContext.rpcRequestList);

  const filteredData = useMemo(
    () => data.filter((row) => matchesRpcRequestFilter(row, filter)),
    [data, filter],
  );

  const {
    requestId,
    setRequestId,
    setDetailsTab,
    selectedInnerCall,
    setSelectedInnerCall,
  } = appContext;

  // The selection outlives the details: Esc closes them and Enter reopens them
  const [selectedId, setSelectedId] = useState(requestId);
  const selection = requestId ?? selectedId;

  const select = (id: string, openDetails: boolean) => {
    setSelectedId(id);
    setRequestId(openDetails ? id : null);
  };

  // An Inner Call line selects its Multicall, and highlights the Inner Call
  // in the Params; a click or Enter opens them there
  const selectLine = (line: RpcRequestLine, openDetails: boolean) => {
    const id = line.row.request.id;
    select(id, openDetails);
    setSelectedInnerCall(
      line.kind === "innerCall"
        ? { requestId: id, index: line.innerCall.index }
        : null,
    );
  };

  const openLine = (line: RpcRequestLine) => {
    selectLine(line, true);
    if (line.kind === "innerCall") {
      setDetailsTab("Params");
    }
  };

  // Lasts until the list is cleared, by Clear or a reload
  const [expansion, setExpansion] = useState(emptyExpansion);
  const listCleared = appContext.rpcRequestList.length === 0;
  useEffect(() => {
    if (listCleared) {
      setExpansion(emptyExpansion());
    }
  }, [listCleared]);

  const setRowExpanded = (row: RpcRequestRow, expanded: boolean) => {
    setExpansion((current) =>
      setExpanded(current, row, filter.search, expanded),
    );
    // A hidden Inner Call hands the highlight back to its Multicall
    if (!expanded && selectedInnerCall?.requestId === row.request.id) {
      setSelectedInnerCall(null);
    }
  };

  // A filtered-out RPC Request can no longer be selected
  useEffect(() => {
    if (
      selection !== null &&
      !filteredData.some((row) => row.request.id === selection)
    ) {
      setSelectedId(null);
      setRequestId(null);
    }
  }, [filteredData, selection, setRequestId]);

  // With the details open only the Method column is left, Network-style
  const collapsed = requestId !== null;
  const rowHeight = collapsed ? COLLAPSED_ROW_HEIGHT : ROW_HEIGHT;

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() =>
    loadColumnSizing(localStorage),
  );

  const table = useReactTable({
    ...rpcRequestTableOptions,
    data: filteredData,
    state: {
      sorting,
      columnSizing,
      columnVisibility: collapsed ? COLLAPSED_COLUMNS : {},
    },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
  });

  // Save once a drag ends rather than on every pointer move
  const isResizing = !!table.getState().columnSizingInfo.isResizingColumn;
  useEffect(() => {
    if (!isResizing) {
      saveColumnSizing(localStorage, columnSizing);
    }
  }, [columnSizing, isResizing]);

  const { rows } = table.getRowModel();
  const tableRows = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows],
  );
  const lines = useMemo(
    () =>
      buildRpcRequestLines(
        rows.map((row) => row.original),
        expansion,
        filter.search,
      ),
    [rows, expansion, filter.search],
  );
  const selectedLineId = getSelectedLineId(
    lines,
    selection,
    selectedInnerCall?.requestId === selection ? selectedInnerCall.index : null,
  );

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    // The sticky header sits above the first row inside the scroll element
    scrollMargin: ROW_HEIGHT,
    // Keep rows scrolled into view from under the sticky header
    scrollPaddingStart: ROW_HEIGHT,
    overscan: 20,
  });

  // Follow new rows only while the user has not scrolled up. A sorted table
  // never follows: new rows land anywhere in it, not at the bottom.
  const stickToBottom = useRef(true);
  const sorted = sorting.length > 0;
  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement && stickToBottom.current && !sorted) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [lines.length, sorted, scrollRef]);

  // Rows change height as the details open and close; keep the selected one
  // in view through the change
  const selectedIndex = lines.findIndex((line) => line.id === selectedLineId);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  useLayoutEffect(() => {
    virtualizer.measure();
    if (selectedIndexRef.current >= 0) {
      virtualizer.scrollToIndex(selectedIndexRef.current, { align: "auto" });
    }
  }, [virtualizer, rowHeight]);

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    if (LINE_KEYS.has(event.key)) {
      event.preventDefault();
      const action = getLineKeyAction(
        lines,
        selectedLineId,
        event.key as LineKey,
      );
      if (action?.kind === "select") {
        // The details follow the selection while they are open
        selectLine(action.line, requestId !== null);
        virtualizer.scrollToIndex(lines.indexOf(action.line), {
          align: "auto",
        });
      } else if (action) {
        setRowExpanded(action.row, action.kind === "expand");
      }
    } else if (event.key === "Enter") {
      const line = lines.find((candidate) => candidate.id === selectedLineId);
      if (line) {
        event.preventDefault();
        openLine(line);
      }
    }
  };

  const pressedResizer = useRef(false);

  const totalWidth = collapsed ? 0 : table.getTotalSize();

  return (
    <div className={cx("rpc-table", { "rpc-table-collapsed": collapsed })}>
      <div
        ref={scrollRef}
        className="rpc-table-scroll"
        role="treegrid"
        aria-rowcount={lines.length + 1}
        aria-activedescendant={
          selectedLineId === null
            ? undefined
            : `rpc-table-row-${selectedLineId}`
        }
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        onScroll={(event) => {
          stickToBottom.current = isScrolledToBottom(event.currentTarget);
        }}
      >
        <div style={{ minWidth: totalWidth }}>
          {table.getHeaderGroups().map((headerGroup) => (
            <div key={headerGroup.id} className="rpc-table-header" role="row">
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <div
                    key={header.id}
                    role="columnheader"
                    aria-sort={sorted ? ARIA_SORT[sorted] : "none"}
                    className="rpc-table-cell rpc-table-header-cell"
                    style={{ width: collapsed ? undefined : header.getSize() }}
                    onMouseDown={(event) => {
                      pressedResizer.current =
                        event.target instanceof Element &&
                        event.target.classList.contains("rpc-table-resizer");
                    }}
                    onClick={(event) => {
                      // A drag released over the header must not sort it
                      if (!pressedResizer.current) {
                        header.column.getToggleSortingHandler()?.(event);
                      }
                    }}
                  >
                    <span className="rpc-table-cell-text">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </span>
                    {sorted && (
                      <span className="rpc-table-sort-arrow">
                        {SORT_ARROWS[sorted]}
                      </span>
                    )}
                    {!collapsed && (
                      <div
                        className={cx("rpc-table-resizer", {
                          "rpc-table-resizer-active":
                            header.column.getIsResizing(),
                        })}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                      />
                    )}
                  </div>
                );
              })}
              <div className="rpc-table-filler" />
            </div>
          ))}

          <div
            className="rpc-table-body"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const line = lines[virtualRow.index];
              const row = tableRows.get(line.row.request.id);
              if (!row) {
                return null;
              }
              const selected = selectedLineId === line.id;
              return (
                <div
                  key={line.id}
                  id={`rpc-table-row-${line.id}`}
                  role="row"
                  aria-rowindex={virtualRow.index + 2}
                  aria-selected={selected}
                  aria-level={line.kind === "innerCall" ? 2 : 1}
                  aria-expanded={
                    line.kind === "rpcRequest" && line.expandable
                      ? line.expanded
                      : undefined
                  }
                  className={cx("rpc-table-row", {
                    "rpc-table-row-striped": virtualRow.index % 2 === 1,
                    "rpc-table-row-failed":
                      line.kind === "rpcRequest" && line.row.failed,
                    "rpc-table-row-selected": selected,
                    "rpc-table-row-inner-call": line.kind === "innerCall",
                  })}
                  style={{
                    transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                  }}
                  // A click always opens the details; only Esc and ✕ close them
                  onClick={() => openLine(line)}
                >
                  {collapsed && line.kind === "innerCall" && (
                    <div
                      role="gridcell"
                      className="rpc-table-cell rpc-table-inner-call-cell"
                      title={formatInnerCallLabel(line.innerCall)}
                    >
                      <span className="rpc-table-cell-text">
                        <InnerCallLabel innerCall={line.innerCall} />
                      </span>
                    </div>
                  )}
                  {collapsed && line.kind === "rpcRequest" && (
                    <div
                      role="gridcell"
                      className="rpc-table-cell"
                      title={[
                        row.original.method,
                        formatCollapsedSubtitle(row.original),
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    >
                      <span className="rpc-table-cell-text">
                        <MethodLabel
                          line={line}
                          onToggle={() =>
                            setRowExpanded(line.row, !line.expanded)
                          }
                        />
                      </span>
                      <span className="rpc-table-cell-text rpc-table-cell-subtitle">
                        <CollapsedSubtitle row={row.original} />
                      </span>
                    </div>
                  )}
                  {!collapsed &&
                    row.getVisibleCells().map((cell) => {
                      const width = cell.column.getSize();
                      // An Inner Call fills the first column only
                      if (line.kind === "innerCall") {
                        return cell.column.id === "method" ? (
                          <div
                            key={cell.id}
                            role="gridcell"
                            className="rpc-table-cell rpc-table-inner-call-cell"
                            style={{ width }}
                            title={formatInnerCallLabel(line.innerCall)}
                          >
                            <span className="rpc-table-cell-text">
                              <InnerCallLabel innerCall={line.innerCall} />
                            </span>
                          </div>
                        ) : (
                          <div
                            key={cell.id}
                            role="gridcell"
                            className="rpc-table-cell"
                            style={{ width }}
                          />
                        );
                      }
                      const value =
                        cell.column.id === "method" && line.row.innerCalls
                          ? line.row.method +
                            formatInnerCallCount(line.row.innerCalls)
                          : cell.getValue();
                      const muted =
                        cell.column.id === "function" &&
                        getFunctionLabel(row.original)?.decoded === false;
                      return (
                        <div
                          key={cell.id}
                          role="gridcell"
                          className="rpc-table-cell"
                          style={{ width }}
                          // Full text of a cell the column width truncates
                          title={typeof value === "string" ? value : undefined}
                        >
                          <span
                            className={cx("rpc-table-cell-text", {
                              "rpc-table-muted": muted,
                            })}
                          >
                            {cell.column.id === "method" ? (
                              <MethodLabel
                                line={line}
                                onToggle={() =>
                                  setRowExpanded(line.row, !line.expanded)
                                }
                              />
                            ) : (
                              flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext(),
                              )
                            )}
                          </span>
                        </div>
                      );
                    })}
                  <div className="rpc-table-filler" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rpc-table-status-bar">
        {`${rows.length} / ${data.length} requests`}
      </div>
    </div>
  );
};
