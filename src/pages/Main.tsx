import cx from "classnames";
import { useContext, useEffect, useRef, useState } from "react";
import { RequestTable } from "../components/RequestTable.tsx";
import { RequestDetails } from "../components/RequestDetails.tsx";
import { AppContext } from "../components/AppContext.tsx";
import {
  clampTableWidth,
  loadTableWidth,
  saveTableWidth,
} from "../details/detailsSplitStorage.ts";
import { addPanelShortcut } from "../utils/panelShortcut.ts";

// Esc in a form field belongs to the field, not to the details
const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export const Main = () => {
  const { requestId, setRequestId, rpcRequestList } = useContext(AppContext);

  const rpcRequest =
    requestId === null
      ? undefined
      : rpcRequestList.find((request) => request.id === requestId);

  useEffect(() => {
    if (!rpcRequest) {
      return;
    }
    // Handled, Esc does not also toggle the DevTools drawer
    return addPanelShortcut((event) => {
      if (event.key !== "Escape" || isEditable(event.target)) {
        return false;
      }
      setRequestId(null);
      return true;
    });
  }, [rpcRequest, setRequestId]);

  const panelRef = useRef<HTMLDivElement>(null);
  const [tableWidth, setTableWidth] = useState(() =>
    loadTableWidth(localStorage),
  );

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    event.preventDefault();
    const divider = event.currentTarget;
    divider.setPointerCapture(event.pointerId);

    const panelLeft = panel.getBoundingClientRect().left;
    let width = tableWidth;
    const onMove = (moveEvent: PointerEvent) => {
      width = clampTableWidth(moveEvent.clientX - panelLeft, panel.clientWidth);
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

  return (
    <div
      ref={panelRef}
      className="flex h-screen dark:text-neutral-200 dark:bg-neutral-800"
    >
      {/* The table spans the Panel until an RPC Request is selected */}
      <div
        className={cx(
          "h-full",
          rpcRequest ? "rpc-details-table" : "min-w-0 flex-1",
        )}
        style={rpcRequest ? { width: tableWidth ?? "40%" } : undefined}
      >
        <RequestTable />
      </div>
      {rpcRequest && (
        <>
          <div
            className="rpc-details-divider"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={startDrag}
          />
          <div className="flex-1 min-w-0 h-full">
            <RequestDetails
              request={rpcRequest}
              onClose={() => setRequestId(null)}
            />
          </div>
        </>
      )}
    </div>
  );
};
