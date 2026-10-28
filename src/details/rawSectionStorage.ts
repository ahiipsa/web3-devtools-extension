// Kept in the Panel's localStorage, so the folds survive closing DevTools
const RAW_SECTIONS_KEY = "rpcRequestDetails.rawSections";

// Raw params, Raw result, Raw error, Raw response
export type RawSectionTitle = string;

// The user's last fold (false) or unfold (true) of each raw section, apart
// beside a decoded view and without one: folding Raw params beside its
// decoded input must not hide the only view of another RPC Request's params
export type RawSectionFolds = Record<string, boolean>;

type FoldStorage = Pick<Storage, "getItem" | "setItem">;

const foldKey = (title: RawSectionTitle, hasDecodedView: boolean) =>
  hasDecodedView ? `${title} beside decoded` : title;

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

// The folds with this one; they still apply for this Panel session when the
// storage refuses them
export function saveRawSectionFold(
  storage: FoldStorage,
  title: RawSectionTitle,
  hasDecodedView: boolean,
  open: boolean,
): RawSectionFolds {
  const folds = {
    ...loadRawSectionFolds(storage),
    [foldKey(title, hasDecodedView)]: open,
  };
  try {
    storage.setItem(RAW_SECTIONS_KEY, JSON.stringify(folds));
  } catch {
    // Remembered until the Panel reloads
  }
  return folds;
}

// Until the user folds or unfolds it, a raw section is folded when its tab
// also shows a decoded view of the same data, and open when it does not
export const isRawSectionOpen = (
  folds: RawSectionFolds,
  title: RawSectionTitle,
  hasDecodedView: boolean,
) => folds[foldKey(title, hasDecodedView)] ?? !hasDecodedView;
