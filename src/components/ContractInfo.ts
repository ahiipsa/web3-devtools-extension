import {RpcLog} from "../types/main.ts";

interface ContractInfoProps {
  rpcLog: RpcLog
}

/*
abi table:
Record<ID, {name: string, abi: string}>

contract table:
Record<Address, {address: 0x00, name: '', abi: ID}>
 */

// Save ABI data for a contract using chrome.storage.sync
function saveABI(contractAddress, abiData) {
  // First, retrieve the existing ABIs
  chrome.storage.local.get({ abis: {} }, (result) => {
    const abis = result.abis;
    abis[contractAddress] = abiData;
    // Save the updated object back to storage
    chrome.storage.local.set({ abis: abis }, () => {
      console.log(`ABI saved for contract ${contractAddress}`);
    });
  });
}

export const ContractInfo = (props: ContractInfoProps) => {


  return (
    null
  )


}