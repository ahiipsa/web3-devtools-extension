import cx from "classnames";
import { useContext } from "react";
import { RequestTable } from "../components/RequestTable.tsx";
import { RightSideContainer } from "../components/RightSideContainer.tsx";
import { AppContext } from "../components/AppContext.tsx";

export const Main = () => {
  const appContext = useContext(AppContext);

  return (
    <div className="flex h-screen dark:text-neutral-200 dark:bg-neutral-800">
      {/* The table spans the Panel until an RPC Request is selected */}
      <div
        className={cx(
          "h-full min-w-0 border-r-1 border-neutral-300 dark:border-neutral-700",
          appContext.requestId ? "w-2/5 shrink-0" : "flex-1",
        )}
      >
        <RequestTable />
      </div>
      <RightSideContainer />
    </div>
  );
};
