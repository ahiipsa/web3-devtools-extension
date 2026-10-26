export type SelectionMove = "next" | "previous" | "first" | "last";

// Moves over the visible (sorted and filtered) RPC Requests, Network-style:
// no wrapping around, and with no visible selection ↓ starts at the top and
// ↑ at the bottom
export function moveSelection<Id>(
  visibleIds: readonly Id[],
  selectedId: Id | null,
  move: SelectionMove,
): Id | null {
  if (visibleIds.length === 0) {
    return null;
  }
  const lastIndex = visibleIds.length - 1;
  const index = selectedId === null ? -1 : visibleIds.indexOf(selectedId);

  switch (move) {
    case "first":
      return visibleIds[0];
    case "last":
      return visibleIds[lastIndex];
    case "next":
      return visibleIds[index < 0 ? 0 : Math.min(index + 1, lastIndex)];
    case "previous":
      return visibleIds[index < 0 ? lastIndex : Math.max(index - 1, 0)];
  }
}
