import { formatUnits, isAddress } from "viem";
import { ExplorerTarget, isBlockHash } from "../chains/explorers.ts";
import { getChainName } from "../chains/chainNames.ts";
import { getNativeCurrency } from "../chains/nativeCurrencies.ts";
import { count } from "../utils/text.ts";
import { formatAddress, formatShortAddress } from "./formatAddress.ts";

// A piece of a formatted value: plain text, or a value with copy and, for
// what an Explorer can look up, ↗. `text` is how it shows, `value` what
// copies. Muted pieces sit beside the main value: its raw form or a hint
export type ValuePart =
  | { kind: "text"; text: string; muted?: true }
  | {
      kind: "value";
      text: string;
      value: string;
      explorer?: ExplorerTarget["kind"];
      muted?: true;
    };

// One line of a formatted value; a word in storage reads several ways, each
// labelled
export interface ValueLine {
  label?: string;
  parts: ValuePart[];
}

// The methods of the Chain Method Category whose params and result are a few
// well-known scalars
const SCALAR_METHODS = [
  "eth_blockNumber",
  "eth_chainId",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_blobBaseFee",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_getCode",
  "eth_getStorageAt",
];

export const isScalarChainMethod = (method: string) =>
  SCALAR_METHODS.includes(method);

const BLOCK_TAGS = ["latest", "pending", "safe", "finalized", "earliest"];

// Thousands separated by commas whatever the browser locale; a fraction
// stays as it is
export const groupThousands = (number: string) =>
  number.replace(/^-?\d+/, (integer) =>
    integer.replace(/\B(?=(\d{3})+$)/g, ","),
  );

const parseQuantity = (value: unknown) =>
  typeof value === "string" && /^0x[0-9a-f]+$/i.test(value)
    ? BigInt(value)
    : undefined;

// A 32-byte hash or word short, as the call line shows it
const formatShortHex = (hex: string) =>
  hex.length > 14 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex;

const SEPARATOR: ValuePart = { kind: "text", text: " · ", muted: true };

// A number with commas; copying it gives the bare number
const numberPart = (
  number: bigint,
  unit = "",
  explorer?: ExplorerTarget["kind"],
): ValuePart => ({
  kind: "value",
  text: groupThousands(number.toString()) + unit,
  value: number.toString(),
  explorer,
});

// The hex as the RPC Response has it, muted, with its own copy
const besideHex = (hex: string): ValuePart[] => [
  SEPARATOR,
  { kind: "value", text: hex, value: hex, muted: true },
];

// An amount in a unit with its wei beside it: `0.01 ETH · 10,000,… wei`
const amountParts = (wei: bigint, decimals: number, unit: string) => {
  const amount = formatUnits(wei, decimals);
  return [
    { kind: "value", text: `${groupThousands(amount)} ${unit}`, value: amount },
    SEPARATOR,
    {
      kind: "value",
      text: `${groupThousands(wei.toString())} wei`,
      value: wei.toString(),
      muted: true,
    },
  ] satisfies ValuePart[];
};

const addressPart = (address: string): ValuePart => ({
  kind: "value",
  text: formatAddress(address),
  value: formatAddress(address),
  explorer: "address",
});

// `4.2 KB`, or bytes under a KB
const formatSize = (bytes: number) =>
  bytes < 1024
    ? count(bytes, "byte")
    : `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`;

// An EIP-7702 delegation designator: 0xef0100 and the delegate's address
const DELEGATION = /^0xef0100([0-9a-f]{40})$/i;

const formatBytecode = (code: unknown): ValueLine[] | undefined => {
  if (typeof code !== "string" || !/^0x([0-9a-f]{2})*$/i.test(code)) {
    return undefined;
  }
  if (code === "0x") {
    return [
      {
        parts: [
          { kind: "text", text: "No code" },
          {
            kind: "text",
            text: " · a wallet, or nothing deployed",
            muted: true,
          },
        ],
      },
    ];
  }
  const delegate = DELEGATION.exec(code)?.[1];
  if (delegate) {
    return [
      {
        parts: [
          { kind: "text", text: "Delegated to " },
          addressPart(`0x${delegate}`),
          { kind: "text", text: " · EIP-7702", muted: true },
        ],
      },
    ];
  }
  return [
    {
      parts: [
        {
          kind: "text",
          text: `Contract · ${formatSize((code.length - 2) / 2)} of bytecode`,
        },
      ],
    },
  ];
};

// The word as a number and, when its top 12 bytes are zero, as an address,
// such as a proxy's implementation; some nodes drop the leading zeros
const formatStorageWord = (word: unknown): ValueLine[] | undefined => {
  if (typeof word !== "string" || !/^0x[0-9a-f]{1,64}$/i.test(word)) {
    return undefined;
  }
  const padded = word.slice(2).padStart(64, "0");
  const number = BigInt(word);
  const lines: ValueLine[] = [
    { label: "as uint256", parts: [numberPart(number)] },
  ];
  // A zero word is no address
  if (padded.startsWith("0".repeat(24)) && number !== 0n) {
    lines.push({
      label: "as address",
      parts: [addressPart(`0x${padded.slice(24)}`)],
    });
  }
  return lines;
};

const quantityLine = (
  result: unknown,
  parts: (quantity: bigint, hex: string) => ValuePart[],
): ValueLine[] | undefined => {
  const quantity = parseQuantity(result);
  return quantity === undefined
    ? undefined
    : [{ parts: parts(quantity, result as string) }];
};

// The result of a scalar Chain method or eth_estimateGas, its main value
// first; undefined for another method or a result that does not read
export function formatChainMethodResult(
  method: string,
  result: unknown,
  chainId: number | undefined,
): ValueLine[] | undefined {
  switch (method) {
    case "eth_blockNumber":
      return quantityLine(result, (number, hex) => [
        numberPart(number, "", "block"),
        ...besideHex(hex),
      ]);
    case "eth_chainId":
      return quantityLine(result, (id, hex) => {
        const name = getChainName(Number(id));
        return [
          { kind: "value", text: id.toString(), value: id.toString() },
          ...(name ? [{ kind: "text", text: ` · ${name}` } as const] : []),
          ...besideHex(hex),
        ];
      });
    case "eth_getBalance":
      return quantityLine(result, (wei) =>
        amountParts(wei, 18, getNativeCurrency(chainId)),
      );
    case "eth_gasPrice":
    case "eth_maxPriorityFeePerGas":
    case "eth_blobBaseFee":
      return quantityLine(result, (wei) => amountParts(wei, 9, "gwei"));
    case "eth_estimateGas":
      return quantityLine(result, (gas, hex) => [
        numberPart(gas, " gas"),
        ...besideHex(hex),
      ]);
    case "eth_getTransactionCount":
      return quantityLine(result, (nonce, hex) => [
        numberPart(nonce),
        ...besideHex(hex),
      ]);
    case "eth_getCode":
      return formatBytecode(result);
    case "eth_getStorageAt":
      return formatStorageWord(result);
  }
  return undefined;
}

// The main value on one line, without what is muted beside it
export function formatChainMethodResultInline(
  method: string,
  result: unknown,
  chainId: number | undefined,
): string | undefined {
  const [line] = formatChainMethodResult(method, result, chainId) ?? [];
  return line?.parts
    .filter((part) => !part.muted)
    .map((part) => part.text)
    .join("");
}

// A param as the details show it and, shorter, as the call line does
export interface FormattedParam {
  parts: ValuePart[];
  inline: string;
}

const formatOther = (value: unknown): FormattedParam => {
  const text = JSON.stringify(value) ?? String(value);
  return { parts: [{ kind: "text", text }], inline: text };
};

const formatBlockHash = (hash: string): FormattedParam => ({
  parts: [{ kind: "value", text: hash, value: hash, explorer: "block" }],
  inline: formatShortHex(hash),
});

// A block param: a tag as is, a number in decimal with its hex, a hash, or
// an EIP-1898 object by the hash or number it holds
export function formatBlockParam(block: unknown): FormattedParam {
  if (typeof block === "string" && BLOCK_TAGS.includes(block)) {
    return { parts: [{ kind: "text", text: block }], inline: block };
  }
  if (isBlockHash(block)) {
    return formatBlockHash(block);
  }
  const number = parseQuantity(block);
  if (number !== undefined) {
    return {
      parts: [numberPart(number, "", "block"), ...besideHex(block as string)],
      inline: groupThousands(number.toString()),
    };
  }
  if (typeof block === "object" && block !== null) {
    if ("blockHash" in block && isBlockHash(block.blockHash)) {
      return formatBlockHash(block.blockHash);
    }
    if (
      "blockNumber" in block &&
      parseQuantity(block.blockNumber) !== undefined
    ) {
      return formatBlockParam(block.blockNumber);
    }
  }
  return formatOther(block);
}

const formatAddressParam = (address: unknown): FormattedParam =>
  typeof address === "string" && isAddress(address, { strict: false })
    ? { parts: [addressPart(address)], inline: formatShortAddress(address) }
    : formatOther(address);

const formatSlotParam = (slot: unknown): FormattedParam =>
  typeof slot === "string"
    ? {
        parts: [{ kind: "value", text: slot, value: slot }],
        inline: formatShortHex(slot),
      }
    : formatOther(slot);

const PARAM_FORMATS = {
  address: formatAddressParam,
  slot: formatSlotParam,
  block: formatBlockParam,
};

// The positional params of each method that takes any
const NAMED_PARAMS: Record<string, (keyof typeof PARAM_FORMATS)[]> = {
  eth_getBalance: ["address", "block"],
  eth_getTransactionCount: ["address", "block"],
  eth_getCode: ["address", "block"],
  eth_getStorageAt: ["address", "slot", "block"],
};

export interface NamedParam extends FormattedParam {
  name: string;
}

// The params a scalar Chain method sent, by name; none for another method,
// for params that are not an array, or for a method without params
export function getNamedParams(
  method: string,
  params: unknown,
): NamedParam[] | undefined {
  const names = NAMED_PARAMS[method];
  if (!names || !Array.isArray(params)) {
    return undefined;
  }
  return names.flatMap((name, index) =>
    index < params.length
      ? [{ name, ...PARAM_FORMATS[name](params[index]) }]
      : [],
  );
}

// eth_call's and eth_estimateGas's third param: `2 addresses`. Undefined
// when it overrides nothing
export function formatStateOverride(override: unknown): string | undefined {
  if (
    typeof override !== "object" ||
    override === null ||
    Array.isArray(override)
  ) {
    return undefined;
  }
  const addresses = Object.keys(override).length;
  if (addresses === 0) {
    return undefined;
  }
  return addresses === 1 ? "1 address" : `${addresses} addresses`;
}
