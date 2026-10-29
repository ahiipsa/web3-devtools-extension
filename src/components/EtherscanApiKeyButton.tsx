import { useContext } from "react";
import { AppContext } from "./AppContext.tsx";
import { GearIcon } from "./devtoolsIcons.tsx";

// Beside an Etherscan API key Etherscan rejected: opens the toolbar's
// settings with the focus in the key field
export const EtherscanApiKeyButton = () => {
  const { openEtherscanApiKeySettings } = useContext(AppContext);

  return (
    <button
      type="button"
      className="rpc-details-settings-button"
      title="Change the Etherscan API key"
      aria-label="Change the Etherscan API key"
      onClick={openEtherscanApiKeySettings}
    >
      <GearIcon />
    </button>
  );
};
