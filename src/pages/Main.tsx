import cx from "classnames";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { RequestTable } from "../components/RequestTable.tsx";
import { RequestDetails } from "../components/RequestDetails.tsx";
import { RequestToolbar } from "../components/RequestToolbar.tsx";
import { AppContext } from "../components/AppContext.tsx";
import {
  clampTableWidth,
  loadTableWidth,
  saveTableWidth,
} from "../details/detailsSplitStorage.ts";
import {
  loadRpcRequestFilter,
  saveRpcRequestFilter,
} from "../table/rpcRequestFilterStorage.ts";
import { addPanelShortcut } from "../utils/panelShortcut.ts";

// Esc in a form field belongs to the field, not to the details
const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export const Main = () => {
  const { requestId, setRequestId, rpcRequestList, clearRpcRequestList } =
    useContext(AppContext);

  const [filter, setFilter] = useState(() =>
    loadRpcRequestFilter(localStorage),
  );
  useEffect(() => {
    saveRpcRequestFilter(localStorage, filter);
  }, [filter]);

  const rpcRequest =
    requestId === null
      ? undefined
      : rpcRequestList.find((request) => request.id === requestId);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

  // Closing unmounts the details, so focus inside them would fall to <body>
  // and leave the keyboard dead; hand it to the grid instead, Network-style.
  // So does focus already on <body>, e.g. after a click on plain text in the
  // details. Focus elsewhere stays where it is.
  const closeDetails = useCallback(() => {
    const focused = document.activeElement;
    if (focused === document.body || detailsRef.current?.contains(focused)) {
      tableScrollRef.current?.focus({ preventScroll: true });
    }
    setRequestId(null);
  }, [setRequestId]);

  useEffect(() => {
    if (!rpcRequest) {
      return;
    }
    // Handled, Esc does not also toggle the DevTools drawer
    return addPanelShortcut((event) => {
      if (event.key !== "Escape" || isEditable(event.target)) {
        return false;
      }
      closeDetails();
      return true;
    });
  }, [rpcRequest, closeDetails]);

  const splitRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(() =>
    loadTableWidth(localStorage),
  );

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const split = splitRef.current;
    if (!split) {
      return;
    }
    event.preventDefault();
    const divider = event.currentTarget;
    divider.setPointerCapture(event.pointerId);

    const splitLeft = split.getBoundingClientRect().left;
    let width = tableWidth;
    const onMove = (moveEvent: PointerEvent) => {
      width = clampTableWidth(moveEvent.clientX - splitLeft, split.clientWidth);
      setTableWidth(width);
    };
    // Save once the drag ends rather than on every pointer move
    const onUp = () => {
      divider.removeEventListener("pointermove", onMove);
      divider.removeEventListener("pointerup", onUp);
      divider.removeEventListener("pointercancel", onUp);
      if (width !== null) {
        saveTableWidth(localStorage, width);
      }
    };
    divider.addEventListener("pointermove", onMove);
    divider.addEventListener("pointerup", onUp);
    divider.addEventListener("pointercancel", onUp);
  };

  // The toolbar spans the Panel above both sides of the split, so opening or
  // resizing the details never moves it, like the Network filter bar
  return (
    <div className="flex flex-col h-screen dark:text-neutral-200 dark:bg-neutral-800">
      <RequestToolbar
        filter={filter}
        onFilterChange={setFilter}
        onClear={clearRpcRequestList}
      />
      <div ref={splitRef} className="flex flex-1 min-h-0">
        {/* The table spans the Panel until an RPC Request is selected */}
        <div
          className={cx(
            "h-full",
            rpcRequest ? "rpc-details-table" : "min-w-0 flex-1",
          )}
          style={rpcRequest ? { width: tableWidth ?? "40%" } : undefined}
        >
          <RequestTable filter={filter} scrollRef={tableScrollRef} />
        </div>
        {rpcRequest && (
          <>
            <div
              className="rpc-details-divider"
              role="separator"
              aria-orientation="vertical"
              onPointerDown={startDrag}
            />
            <div ref={detailsRef} className="flex-1 min-w-0 h-full">
              <RequestDetails request={rpcRequest} onClose={closeDetails} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
