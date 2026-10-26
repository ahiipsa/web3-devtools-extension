export const DETAILS_TABS = [
  "Overview",
  "Params",
  "Response",
  "Contract",
] as const;

export type DetailsTab = (typeof DETAILS_TABS)[number];

// The Contract tab holds the Contract form, so only RPC Requests to a contract have it
export function getDetailsTabs(isContractCall: boolean): DetailsTab[] {
  return DETAILS_TABS.filter((tab) => isContractCall || tab !== "Contract");
}

// The selected tab is remembered across RPC Requests; one without it shows Overview
export function getShownDetailsTab(
  selectedTab: DetailsTab,
  isContractCall: boolean,
): DetailsTab {
  return getDetailsTabs(isContractCall).includes(selectedTab)
    ? selectedTab
    : "Overview";
}
