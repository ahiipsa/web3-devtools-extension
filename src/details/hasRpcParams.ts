// Whether Params has anything to show: a missing `params` or an empty array
// sends nothing; any other value, even one a node would reject, is shown raw
export const hasRpcParams = (params: unknown) =>
  params !== undefined && !(Array.isArray(params) && params.length === 0);
