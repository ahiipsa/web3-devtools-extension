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
import { moveSelection, SelectionMove } from "../table/moveSelection.ts";
import {
  matchesRpcRequestFilter,
  RpcRequestFilter,
} from "../table/rpcRequestFilter.ts";
import {
  getFunctionLabel,
  InnerCallRow,
  RpcRequestRow,
} from "../table/rpcRequestRow.ts";

// Match --rpc-table-row-height and --rpc-table-header-height in
// RequestTable.css, with or without the details
const ROW_HEIGHT = 21;
const HEADER_HEIGHT = 26;

// With the details open Method, the only column left, takes the table's whole
// side of the split; closed, every column has the user's width
const getCellStyle = (
  column: { getSize: () => number },
  detailsOpen: boolean,
): React.CSSProperties =>
  detailsOpen ? { flex: "1 1 0", minWidth: 0 } : { width: column.getSize() };

const SORT_ARROWS = { asc: "▲", desc: "▼" } as const;
const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

const KEY_MOVES: Partial<Record<string, SelectionMove>> = {
  ArrowDown: "next",
  ArrowUp: "previous",
  Home: "first",
  End: "last",
};

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

// The method, and a Multicall's Inner Call count after it
const MethodLabel = ({ row }: { row: RpcRequestRow }) => {
  const count = row.innerCalls && countInnerCalls(row.innerCalls);
  return (
    <>
      {row.method}
      {count && (
        <>
          <span className="rpc-table-muted">{count.total}</span>
          <span className="rpc-table-failed-mark">{count.failed}</span>
        </>
      )}
    </>
  );
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

  const { requestId, setRequestId } = appContext;

  // The selection outlives the details: Esc closes them and Enter reopens them
  const [selectedId, setSelectedId] = useState(requestId);
  const selection = requestId ?? selectedId;

  const select = (id: string, openDetails: boolean) => {
    setSelectedId(id);
    setRequestId(openDetails ? id : null);
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
  // Selected RPC Request stays where it was; every column but Method hides
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
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    // The sticky header sits above the first row inside the scroll element
    scrollMargin: HEADER_HEIGHT,
    // Keep rows scrolled into view from under the sticky header
    scrollPaddingStart: HEADER_HEIGHT,
    overscan: 20,
  });

  // Follow new RPC Requests only while the user has not scrolled up. A sorted
  // table never follows: new rows land anywhere in it, not at the bottom.
  const stickToBottom = useRef(true);
  const sorted = sorting.length > 0;
  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement && stickToBottom.current && !sorted) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [rows.length, sorted, scrollRef]);

  // Opening the details on a selected row scrolled out of view (Enter after
  // Esc) brings it back; a row in view stays where it is
  const selectedIndex = rows.findIndex((row) => row.id === selection);
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  useLayoutEffect(() => {
    if (detailsOpen && selectedIndexRef.current >= 0) {
      virtualizer.scrollToIndex(selectedIndexRef.current, { align: "auto" });
    }
  }, [virtualizer, detailsOpen]);

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const ids = rows.map((row) => row.id);
    const move = KEY_MOVES[event.key];
    if (move) {
      event.preventDefault();
      const next = moveSelection(ids, selection, move);
      if (next !== null) {
        // The details follow the selection while they are open
        select(next, requestId !== null);
        virtualizer.scrollToIndex(ids.indexOf(next), { align: "auto" });
      }
    } else if (
      event.key === "Enter" &&
      selection !== null &&
      ids.includes(selection)
    ) {
      event.preventDefault();
      select(selection, true);
    }
  };

  const pressedResizer = useRef(false);

  // With the details open Method fills the table's side, so the table does
  // not scroll sideways
  const totalWidth = detailsOpen ? 0 : table.getTotalSize();

  return (
    <div className="rpc-table">
      <div
        ref={scrollRef}
        className="rpc-table-scroll"
        role="grid"
        aria-rowcount={rows.length + 1}
        aria-activedescendant={
          selection === null ? undefined : `rpc-table-row-${selection}`
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
                    {/* Widths change with the details closed only: open, Method
                        fills the side and a drag would set a width unseen */}
                    {!detailsOpen && (
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
              {!detailsOpen && <div className="rpc-table-filler" />}
            </div>
          ))}

          <div
            className="rpc-table-body"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              const selected = selection === row.id;
              // What the details hide, for the row's and its cells' tooltips
              const hidden = detailsOpen
                ? formatHiddenWithDetails(row.original)
                : undefined;
              return (
                <div
                  key={row.id}
                  id={`rpc-table-row-${row.id}`}
                  role="row"
                  aria-rowindex={virtualRow.index + 2}
                  aria-selected={selected}
                  className={cx("rpc-table-row", {
                    "rpc-table-row-striped": virtualRow.index % 2 === 1,
                    "rpc-table-row-failed": row.original.failed,
                    "rpc-table-row-selected": selected,
                  })}
                  style={{
                    transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                  }}
                  // Also past the last cell, where no cell's own title shows
                  title={hidden}
                  // A click always opens the details; only Esc and ✕ close them
                  onClick={() => select(row.id, true)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnId = cell.column.id;
                    const { innerCalls } = row.original;
                    const value =
                      columnId === "method" && innerCalls
                        ? row.original.method + formatInnerCallCount(innerCalls)
                        : cell.getValue();
                    const muted =
                      columnId === "function" &&
                      getFunctionLabel(row.original)?.decoded === false;
                    // Full text of a cell the column width truncates, and
                    // with the details open what they hide
                    const title = [
                      typeof value === "string" ? value : undefined,
                      hidden,
                    ]
                      .filter(Boolean)
                      .join("\n");
                    return (
                      <div
                        key={cell.id}
                        role="gridcell"
                        className="rpc-table-cell"
                        style={getCellStyle(cell.column, detailsOpen)}
                        title={title || undefined}
                      >
                        <span
                          className={cx("rpc-table-cell-text", {
                            "rpc-table-muted": muted,
                          })}
                        >
                          {columnId === "method" ? (
                            <MethodLabel row={row.original} />
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
                  {!detailsOpen && <div className="rpc-table-filler" />}
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
