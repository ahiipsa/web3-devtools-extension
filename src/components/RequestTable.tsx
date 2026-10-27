import "./RequestTable.css";
import cx from "classnames";
import {
  ColumnSizingState,
  flexRender,
  SortingState,
  useReactTable,
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
import {
  formatHiddenWithDetails,
  getColumnVisibility,
  rpcRequestTableOptions,
} from "../table/rpcRequestTable.ts";
import {
  loadColumnSizing,
  saveColumnSizing,
} from "../table/columnSizingStorage.ts";
import { isScrolledToBottom } from "../table/isScrolledToBottom.ts";
import {
  buildRpcRequestLines,
  emptyExpansion,
  getInnerCallLineId,
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
  getFunctionLabel,
  getInnerCallCells,
  InnerCallRow,
  RpcRequestRow,
} from "../table/rpcRequestRow.ts";

// Matches --rpc-table-row-height in RequestTable.css, with or without the details
const ROW_HEIGHT = 21;

// With the details open, columns that do not fit the table's side of the split
// give way from the last: Function first, then Contract, then Method. Flex
// shrinks by factor × width, so factors this far apart act as an order.
const SHRINK_WITH_DETAILS: Record<string, number> = {
  method: 1,
  contract: 1e3,
  function: 1e6,
};

const getCellStyle = (
  column: { id: string; getSize: () => number },
  detailsOpen: boolean,
): React.CSSProperties =>
  detailsOpen
    ? {
        width: column.getSize(),
        flexShrink: SHRINK_WITH_DETAILS[column.id] ?? 0,
        minWidth: 0,
      }
    : { width: column.getSize() };

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

// A Multicall's Inner Call count, and its failed ones' if any: ` · 12 · 2 ✗`
const countInnerCalls = (innerCalls: InnerCallRow[]) => {
  const failed = innerCalls.filter((innerCall) => innerCall.failed).length;
  return {
    total: ` · ${innerCalls.length}`,
    failed: failed ? ` · ${failed} ✗` : "",
  };
};

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
  const count = innerCalls && countInnerCalls(innerCalls);
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
      {count && (
        <>
          <span className="rpc-table-muted">{count.total}</span>
          <span className="rpc-table-failed-mark">{count.failed}</span>
        </>
      )}
    </>
  );
};

// What an Inner Call line shows in a column: an indented `#n`, ✗ when it
// failed, in Method; its Contract and function in theirs; nothing elsewhere
const InnerCallCellText = (props: {
  innerCall: InnerCallRow;
  columnId: string;
}) => {
  const { innerCall, columnId } = props;
  const cells = getInnerCallCells(innerCall);
  if (columnId === "method") {
    return (
      <>
        {cells.method}
        {innerCall.failed && <span className="rpc-table-failed-mark"> ✗</span>}
      </>
    );
  }
  if (columnId === "contract") {
    return <>{cells.contract}</>;
  }
  if (columnId === "function" && cells.function) {
    return (
      <span className={cx({ "rpc-table-muted": !cells.function.decoded })}>
        {cells.function.text}
      </span>
    );
  }
  return null;
};

const getInnerCallCellTitle = (innerCall: InnerCallRow, columnId: string) => {
  const cells = getInnerCallCells(innerCall);
  if (columnId === "contract") {
    return cells.contract;
  }
  if (columnId === "function") {
    return cells.function?.text;
  }
  return undefined;
};

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

  // Rows keep their single line and height with the details open, so the
  // Selected RPC Request stays where it was; only some columns hide
  const detailsOpen = requestId !== null;

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
      columnVisibility: getColumnVisibility(detailsOpen),
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

  // An Inner Call hidden by a collapse, a search or a filter is no longer
  // highlighted, in the table or in the Params
  useEffect(() => {
    if (
      selectedInnerCall &&
      !lines.some(
        (line) =>
          line.id ===
          getInnerCallLineId(
            selectedInnerCall.requestId,
            selectedInnerCall.index,
          ),
      )
    ) {
      setSelectedInnerCall(null);
    }
  }, [lines, selectedInnerCall, setSelectedInnerCall]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // The sticky header sits above the first row inside the scroll element
    scrollMargin: ROW_HEIGHT,
    // Keep rows scrolled into view from under the sticky header
    scrollPaddingStart: ROW_HEIGHT,
    overscan: 20,
  });

  // Follow new RPC Requests (not expanded Inner Calls) only while the user has not scrolled up. A sorted table
  // never follows: new rows land anywhere in it, not at the bottom.
  const stickToBottom = useRef(true);
  const sorted = sorting.length > 0;
  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement && stickToBottom.current && !sorted) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [rows.length, sorted, scrollRef]);

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

  // With the details open the columns give way rather than the table
  // scrolling sideways
  const totalWidth = detailsOpen ? 0 : table.getTotalSize();

  return (
    <div className="rpc-table">
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
                    style={getCellStyle(header.column, detailsOpen)}
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
                    <div
                      className={cx("rpc-table-resizer", {
                        "rpc-table-resizer-active":
                          header.column.getIsResizing(),
                      })}
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onDoubleClick={() => header.column.resetSize()}
                    />
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
                  // Also past the last cell, where no cell's own title shows
                  title={
                    detailsOpen && line.kind === "rpcRequest"
                      ? formatHiddenWithDetails(line.row)
                      : undefined
                  }
                  // A click always opens the details; only Esc and ✕ close them
                  onClick={() => openLine(line)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnId = cell.column.id;
                    const cellClassName = cx("rpc-table-cell", {
                      "rpc-table-inner-call-cell":
                        line.kind === "innerCall" && columnId === "method",
                    });
                    const style = getCellStyle(cell.column, detailsOpen);
                    if (line.kind === "innerCall") {
                      return (
                        <div
                          key={cell.id}
                          role="gridcell"
                          className={cellClassName}
                          style={style}
                          title={getInnerCallCellTitle(
                            line.innerCall,
                            columnId,
                          )}
                        >
                          <span className="rpc-table-cell-text">
                            <InnerCallCellText
                              innerCall={line.innerCall}
                              columnId={columnId}
                            />
                          </span>
                        </div>
                      );
                    }
                    const value =
                      columnId === "method" && line.row.innerCalls
                        ? line.row.method +
                          formatInnerCallCount(line.row.innerCalls)
                        : cell.getValue();
                    const muted =
                      columnId === "function" &&
                      getFunctionLabel(row.original)?.decoded === false;
                    // Full text of a cell the column width truncates, and
                    // with the details open what they hide
                    const title = [
                      typeof value === "string" ? value : undefined,
                      detailsOpen
                        ? formatHiddenWithDetails(row.original)
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join("\n");
                    return (
                      <div
                        key={cell.id}
                        role="gridcell"
                        className={cellClassName}
                        style={style}
                        title={title || undefined}
                      >
                        <span
                          className={cx("rpc-table-cell-text", {
                            "rpc-table-muted": muted,
                          })}
                        >
                          {columnId === "method" ? (
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
