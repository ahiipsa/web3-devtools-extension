import { HttpResponseBody } from "../types/main.ts";

// Kilobytes of characters, rounded up to a tenth so a cut body never reads
// as its whole size
const formatKb = (length: number) =>
  `${String(Math.ceil((length / 1024) * 10) / 10)} KB`;

// What part of the HTTP response body was kept; nothing when it is whole
export const formatHttpResponseBodyCut = ({
  text,
  length,
}: HttpResponseBody) =>
  text.length < length
    ? `First ${formatKb(text.length)} of ${formatKb(length)}`
    : undefined;
