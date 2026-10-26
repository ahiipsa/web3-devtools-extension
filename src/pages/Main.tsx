import { RequestTable } from "../components/RequestTable.tsx";
import { RightSideContainer } from "../components/RightSideContainer.tsx";

export const Main = () => {
  return (
    <div className="p-0 dark:text-neutral-200 dark:bg-neutral-800">
      <div className="grid grid-cols-4">
        <div className="col-span-1 bg-white h-screen dark:bg-neutral-800 overflow-y-scroll max-h-screen border-r-1">
          <RequestTable />
        </div>
        <RightSideContainer />
      </div>
    </div>
  );
};
