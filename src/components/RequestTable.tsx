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
import { RequestToolbar } from "./RequestToolbar.tsx";
import { useRpcRequestRows } from "../hooks/useRpcRequestRows.ts";
import { rpcRequestTableOptions } from "../table/rpcRequestTable.ts";
import {
  loadColumnSizing,
  saveColumnSizing,
} from "../table/columnSizingStorage.ts";
import { isScrolledToBottom } from "../table/isScrolledToBottom.ts";
import { matchesRpcRequestFilter } from "../table/rpcRequestFilter.ts";
import {
  loadRpcRequestFilter,
  saveRpcRequestFilter,
} from "../table/rpcRequestFilterStorage.ts";

// Matches --rpc-table-row-height in RequestTable.css
const ROW_HEIGHT = 21;

const SORT_ARROWS = { asc: "▲", desc: "▼" } as const;
const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

export const RequestTable = () => {
  const appContext = useContext(AppContext);
  const data = useRpcRequestRows(appContext.rpcRequestList);

  const [filter, setFilter] = useState(() =>
    loadRpcRequestFilter(localStorage),
  );
  useEffect(() => {
    saveRpcRequestFilter(localStorage, filter);
  }, [filter]);

  const filteredData = useMemo(
    () => data.filter((row) => matchesRpcRequestFilter(row, filter)),
    [data, filter],
  );

  // A filtered-out RPC Request can no longer be selected
  const { requestId, setRequestId, setEditForm } = appContext;
  useEffect(() => {
    if (
      requestId !== null &&
      !filteredData.some((row) => row.request.id === requestId)
    ) {
      setRequestId(null);
      setEditForm(false);
    }
  }, [filteredData, requestId, setRequestId, setEditForm]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() =>
    loadColumnSizing(localStorage),
  );

  const table = useReactTable({
    ...rpcRequestTableOptions,
    data: filteredData,
    state: { sorting, columnSizing },
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
    estimateSize: () => ROW_HEIGHT,
    // The sticky header sits above the first row inside the scroll element
    scrollMargin: ROW_HEIGHT,
    overscan: 20,
  });

  // Follow new rows only while the user has not scrolled up
  const stickToBottom = useRef(true);
  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement && stickToBottom.current) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
  }, [rows.length]);

  const pressedResizer = useRef(false);

  const totalWidth = table.getTotalSize();

  return (
    <div className="rpc-table">
      <RequestToolbar
        filter={filter}
        onFilterChange={setFilter}
        onClear={appContext.clearRpcRequestList}
      />

      <div
        ref={scrollRef}
        className="rpc-table-scroll"
        role="grid"
        aria-rowcount={rows.length + 1}
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
                    style={{ width: header.getSize() }}
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
              const row = rows[virtualRow.index];
              return (
                <div
                  key={row.id}
                  role="row"
                  aria-rowindex={virtualRow.index + 2}
                  aria-selected={appContext.requestId === row.id}
                  className={cx("rpc-table-row", {
                    "rpc-table-row-striped": virtualRow.index % 2 === 1,
                    "rpc-table-row-failed": row.original.failed,
                    "rpc-table-row-selected": appContext.requestId === row.id,
                  })}
                  style={{
                    transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                  }}
                  onClick={() => appContext.setRequestId(row.id)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const value = cell.getValue();
                    return (
                      <div
                        key={cell.id}
                        role="gridcell"
                        className="rpc-table-cell"
                        style={{ width: cell.column.getSize() }}
                        // Full text of a cell the column width truncates
                        title={typeof value === "string" ? value : undefined}
                      >
                        <span className="rpc-table-cell-text">
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
