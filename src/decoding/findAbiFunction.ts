import { Abi, AbiFunction, Hex, toFunctionSelector } from "viem";

// Selector lookups are built once per ABI: decoding thousands of rows with
// viem's whole-ABI search would hash every function signature per row
const selectorsByAbi = new WeakMap<Abi, Map<string, AbiFunction>>();

const getSelectors = (abi: Abi) => {
  let selectors = selectorsByAbi.get(abi);
  if (!selectors) {
    selectors = new Map();
    for (const item of abi) {
      if (item.type !== "function") {
        continue;
      }
      try {
        selectors.set(toFunctionSelector(item), item);
      } catch {
        // A function the user's ABI describes too loosely to hash is skipped
      }
    }
    selectorsByAbi.set(abi, selectors);
  }
  return selectors;
};

// The ABI function the calldata's selector points at
export const findAbiFunction = (abi: Abi, data: Hex): AbiFunction | undefined =>
  getSelectors(abi).get(data.slice(0, 10).toLowerCase());
