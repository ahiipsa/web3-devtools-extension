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
import { moveSelection, SelectionMove } from "../table/moveSelection.ts";
import {
  matchesRpcRequestFilter,
  RpcRequestFilter,
} from "../table/rpcRequestFilter.ts";
import {
  formatCollapsedSubtitle,
  getFunctionLabel,
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

const KEY_MOVES: Partial<Record<string, SelectionMove>> = {
  ArrowDown: "next",
  ArrowUp: "previous",
  Home: "first",
  End: "last",
};

// Contract / function under the method, with an undecoded selector muted
// The second line of a collapsed row; see formatCollapsedSubtitle
const CollapsedSubtitle = ({ row }: { row: RpcRequestRow }) => {
  if (!row.contractLabel) {
    return <span className="rpc-table-muted">{row.endpoint}</span>;
  }
  const functionLabel = getFunctionLabel(row);
  return (
    <>
      {row.contractLabel}
      {row.contractLabel && functionLabel && " / "}
      {functionLabel && (
        <span className={cx({ "rpc-table-muted": !functionLabel.decoded })}>
          {functionLabel.text}
        </span>
      )}
    </>
  );
};

interface RequestTableProps {
  filter: RpcRequestFilter;
}

export const RequestTable = ({ filter }: RequestTableProps) => {
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
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
  }, [rows.length, sorted]);

  // Rows change height as the details open and close; keep the selected one
  // in view through the change
  const selectedIndex = rows.findIndex((row) => row.id === requestId);
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

  const totalWidth = collapsed ? 0 : table.getTotalSize();

  return (
    <div className={cx("rpc-table", { "rpc-table-collapsed": collapsed })}>
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
              const row = rows[virtualRow.index];
              return (
                <div
                  key={row.id}
                  id={`rpc-table-row-${row.id}`}
                  role="row"
                  aria-rowindex={virtualRow.index + 2}
                  aria-selected={selection === row.id}
                  className={cx("rpc-table-row", {
                    "rpc-table-row-striped": virtualRow.index % 2 === 1,
                    "rpc-table-row-failed": row.original.failed,
                    "rpc-table-row-selected": selection === row.id,
                  })}
                  style={{
                    transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                  }}
                  // Clicking the selected row again closes the details
                  onClick={() => select(row.id, requestId !== row.id)}
                >
                  {collapsed && (
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
                        {row.original.method}
                      </span>
                      <span className="rpc-table-cell-text rpc-table-cell-subtitle">
                        <CollapsedSubtitle row={row.original} />
                      </span>
                    </div>
                  )}
                  {!collapsed &&
                    row.getVisibleCells().map((cell) => {
                      const value = cell.getValue();
                      const muted =
                        cell.column.id === "function" &&
                        getFunctionLabel(row.original)?.decoded === false;
                      return (
                        <div
                          key={cell.id}
                          role="gridcell"
                          className="rpc-table-cell"
                          style={{ width: cell.column.getSize() }}
                          // Full text of a cell the column width truncates
                          title={typeof value === "string" ? value : undefined}
                        >
                          <span
                            className={cx("rpc-table-cell-text", {
                              "rpc-table-muted": muted,
                            })}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
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
