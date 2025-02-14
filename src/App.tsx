import './App.css'
import {useHttpRequests} from "./hooks/useHttpRequests.ts";
import {RpcLog} from "./types/main.ts";
import {useState} from "react";
import cx from "classnames";
import {trimContractAddress} from "./utils/text.ts";


function App() {

  const [activeRow, setActiveRow] = useState<RpcLog | null>(null)
  const logs = useHttpRequests();

  const handleRowClick = (log: RpcLog) => {
    setActiveRow(log)
  }

  const handleCloseRow = () => {
    setActiveRow(null)
  }

  return (
    <div className="p-0">
      <div className="flex flex-col md:flex-row">
        <div className="bg-white shadow overflow-y-scroll max-h-screen min-w-xs">
          <table className="min-w-full">
            <thead className="bg-gray-200 sticky top-0">
            <tr className="text-xs sticky top-0">
              <th className="px-4 py-2 text-left text-xs sticky top-0">RPC</th>
              <th className={cx('px-4 py-2 text-left text-xs sticky top-0')}>Contract</th>
            </tr>
            </thead>
            <tbody className="">
            {
              logs.map((log, index) => (
                <tr key={index} className="hover:bg-gray-50 cursor-pointer text-xs" onClick={() => handleRowClick(log)}>
                  <td className="border-t px-4 py-2">
                    <div className="flex flex-col">
                      <div className="font-medium">{log?.method}</div>
                      <div>{log?.rpcURL}</div>
                    </div>
                  </td>
                  <td className={cx('border-t px-4 py-2')}>{log.contract && trimContractAddress(log.contract)}</td>
                </tr>
              ))
            }
            </tbody>
          </table>
        </div>
        {activeRow && (
        <div className="bg-white shadow min-h-[200px]">
          <div className="p-2">
            <button onClick={handleCloseRow}>close</button>
          </div>

          <div className="p-4">
            <div className="mt-4">
              <div><strong>id:</strong>{activeRow?.id}</div>
              <div><strong>RPC URL:</strong>{activeRow?.rpcURL}</div>
              <div><strong>Method:</strong> {activeRow?.method}</div>
              <div><strong>Contract:</strong> {activeRow?.contract ? activeRow.contract : '...'}</div>
              <div className="overflow-hidden"><strong>Data:</strong>
                {activeRow?.data && activeRow?.data.slice(0, 10)}
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
)
}

export default App
