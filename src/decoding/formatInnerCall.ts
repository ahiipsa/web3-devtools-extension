import { InnerCall } from "./multicall.ts";
import { DecodedValue } from "./decodeRpcRequest.ts";
import { formatDecodedValue } from "./formatDecodedValue.ts";
import { trimContractAddress } from "../utils/text.ts";

// Positional labels (`[0]`) add nothing inline
const formatValues = (values: DecodedValue[]) =>
  values
    .map(({ name, value }) =>
      name && !name.startsWith("[")
        ? `${name}: ${formatDecodedValue(value)}`
        : formatDecodedValue(value),
    )
    .join(", ");

// The Contract's name and the short target address, else the address alone
export const formatInnerCallTarget = ({ target, contractName }: InnerCall) =>
  [contractName, trimContractAddress(target)].filter(Boolean).join(" ");

// The function with its arguments, else the Selector
export const formatInnerCallFunction = ({ callData, decoding }: InnerCall) =>
  decoding?.status === "decoded"
    ? `${decoding.functionName}(${formatValues(decoding.args)})`
    : callData.slice(0, 10).toLowerCase();

// The decoded return data: a lone value bare, several in parentheses
export const formatInnerCallResult = ({ decoding }: InnerCall) => {
  const values =
    decoding?.status === "decoded" ? decoding.returnValues : undefined;
  if (!values) {
    return undefined;
  }
  return values.length === 1
    ? formatDecodedValue(values[0].value)
    : `(${formatValues(values)})`;
};
