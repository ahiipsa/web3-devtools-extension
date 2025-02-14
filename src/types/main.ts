export type RpcLog = {
  id: number;
  tabId: number;
  rpcURL: string
  requestId: string;
  method: string;
  contract: string;
  data: string;
};