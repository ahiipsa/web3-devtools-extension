export function trimContractAddress(address: string = "") {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
// "1 result", "2 results"
export const count = (n: number, noun: string) =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

// An error's message, fit to show the user
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
