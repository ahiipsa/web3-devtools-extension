// Kept in the Panel's localStorage, so the folds survive closing DevTools
const RAW_SECTIONS_KEY = "rpcRequestDetails.rawSections";

// Raw params, Raw result, Raw error, Raw response
export type RawSectionTitle = string;

// The user's last fold (false) or unfold (true) of each raw section
export type RawSectionFolds = Record<RawSectionTitle, boolean>;

type FoldStorage = Pick<Storage, "getItem" | "setItem">;

export function loadRawSectionFolds(storage: FoldStorage): RawSectionFolds {
  let saved: unknown;
  try {
    saved = JSON.parse(storage.getItem(RAW_SECTIONS_KEY) ?? "{}");
  } catch {
    return {};
  }
  if (typeof saved !== "object" || saved === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(saved).filter(([, open]) => typeof open === "boolean"),
  );
}

export function saveRawSectionFold(
  storage: FoldStorage,
  title: RawSectionTitle,
  open: boolean,
): RawSectionFolds {
  const folds = { ...loadRawSectionFolds(storage), [title]: open };
  storage.setItem(RAW_SECTIONS_KEY, JSON.stringify(folds));
  return folds;
}

// Until the user folds or unfolds it, a raw section is folded when its tab
// also shows a decoded view of the same data, and open when it does not
export const isRawSectionOpen = (
  folds: RawSectionFolds,
  title: RawSectionTitle,
  hasDecodedView: boolean,
) => folds[title] ?? !hasDecodedView;
