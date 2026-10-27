const INDENT = "    ";

// JSON.stringify's layout, except that integers (bigint) print as bare
// numbers at full precision, where JSON has no way to hold them
const toJson = (value: unknown, indent: string): string => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value !== "object" || value === null) {
    return JSON.stringify(value) ?? "null";
  }

  const entries = Array.isArray(value)
    ? value.map((item) => toJson(item, indent + INDENT))
    : Object.entries(value).map(
        ([key, item]) =>
          `${JSON.stringify(key)}: ${toJson(item, indent + INDENT)}`,
      );
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  if (entries.length === 0) {
    return `${open}${close}`;
  }
  return `${open}\n${entries.map((entry) => indent + INDENT + entry).join(",\n")}\n${indent}${close}`;
};

const isStruct = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// A decoded argument or return value as the details show it: a struct
// (named components), and an array holding one, as indented JSON; any
// other array inline; anything else as its plain string
export function formatDecodedValue(value: unknown): string {
  if (isStruct(value) || (Array.isArray(value) && value.some(isStruct))) {
    return toJson(value, "");
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatDecodedValue).join(", ")}]`;
  }
  return String(value);
}
