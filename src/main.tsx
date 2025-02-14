import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'


if (chrome && chrome.devtools) {
  chrome.devtools.panels.create(
    "EVM RPC",
    "",
    "index.html",
    function (panel: unknown) {
      console.log("Ethereum RPC panel added", panel);
    }
  );
}





ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
