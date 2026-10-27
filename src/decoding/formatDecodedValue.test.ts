import { describe, expect, it } from "vitest";
import { formatDecodedValue } from "./formatDecodedValue.ts";

const MAKER = "0x28C6c06298d514Db089934071355E5743bf21d60";

describe("formatDecodedValue", () => {
  it("prints a struct's integers as bare numbers, exact beyond 2^53", () => {
    expect(
      formatDecodedValue({
        maker: MAKER,
        amount: 3n,
        total: 123456789012345678901234567890n,
        delta: -9007199254740993n,
      }),
    ).toBe(
      [
        "{",
        `    "maker": "${MAKER}",`,
        '    "amount": 3,',
        '    "total": 123456789012345678901234567890,',
        '    "delta": -9007199254740993',
        "}",
      ].join("\n"),
    );
  });

  it("keeps booleans and bytes inside a struct as today, and nests", () => {
    expect(
      formatDecodedValue({
        ok: true,
        data: "0xdeadbeef",
        fee: { bps: 30, amounts: [1n, 2n] },
        empty: [],
      }),
    ).toBe(
      [
        "{",
        '    "ok": true,',
        '    "data": "0xdeadbeef",',
        '    "fee": {',
        '        "bps": 30,',
        '        "amounts": [',
        "            1,",
        "            2",
        "        ]",
        "    },",
        '    "empty": []',
        "}",
      ].join("\n"),
    );
  });

  it("prints an array of structs as an indented JSON array with bare integers", () => {
    expect(
      formatDecodedValue([
        { to: MAKER, value: 10n ** 30n },
        { to: MAKER, value: 1n },
      ]),
    ).toBe(
      [
        "[",
        "    {",
        `        "to": "${MAKER}",`,
        '        "value": 1000000000000000000000000000000',
        "    },",
        "    {",
        `        "to": "${MAKER}",`,
        '        "value": 1',
        "    }",
        "]",
      ].join("\n"),
    );
  });

  it.each([
    ["an integer", 1000000n, "1000000"],
    ["a boolean", true, "true"],
    ["an address", MAKER, MAKER],
    ["an array of integers", [1n, 2n], "[1, 2]"],
  ])("prints %s at the top level as today", (_label, value, expected) => {
    expect(formatDecodedValue(value)).toBe(expected);
  });
});
