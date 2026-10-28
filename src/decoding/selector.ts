// The Selector of calldata, lowercase; none for calldata shorter than 4 bytes
export const getFunctionSelector = (data: string | undefined) =>
  data && /^0x[0-9a-f]{8}/i.test(data)
    ? (data.slice(0, 10).toLowerCase() as `0x${string}`)
    : undefined;
