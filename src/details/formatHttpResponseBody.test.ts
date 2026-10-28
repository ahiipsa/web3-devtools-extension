import { describe, expect, it } from "vitest";
import { formatHttpResponseBodyCut } from "./formatHttpResponseBody.ts";

describe("formatHttpResponseBodyCut", () => {
  it("notes the kept part and the full size of a cut body", () => {
    expect(
      formatHttpResponseBodyCut({
        text: "x".repeat(4096),
        length: 18 * 1024,
      }),
    ).toBe("First 4 KB of 18 KB");
  });

  it("rounds sizes up to a tenth of a KB, so a cut never reads as whole", () => {
    expect(
      formatHttpResponseBodyCut({ text: "x".repeat(4096), length: 4100 }),
    ).toBe("First 4 KB of 4.1 KB");
    expect(
      formatHttpResponseBodyCut({ text: "x".repeat(4095), length: 5000 }),
    ).toBe("First 4 KB of 4.9 KB");
  });

  it("is nothing for a whole body", () => {
    expect(formatHttpResponseBodyCut({ text: "Bad Gateway", length: 11 })).toBe(
      undefined,
    );
  });
});
