import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import { ExplorerTarget, getExplorerUrl } from "../chains/explorers.ts";
import { copyText } from "../utils/copyText.ts";

// The chain id of the shown RPC Request's Chain, when it is known
export const DetailsChainContext = createContext<number | undefined>(undefined);

// A copy button that shows a tick for a moment once the value is copied
export const CopyButton = (props: { text: string; label: string }) => {
  const { text, label } = props;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className="rpc-value-action"
      title={copied ? "Copied" : label}
      aria-label={label}
      onClick={() =>
        copyText(text).then(
          () => setCopied(true),
          () => {},
        )
      }
    >
      {copied ? <CheckOutlined /> : <CopyOutlined />}
    </button>
  );
};

// A value in the details as plain selectable text, with copy and, for what an
// Explorer can look up on the RPC Request's Chain, ↗ to it. The actions show
// on hover. `children` is what shows when it differs from the value, such as
// a short address; the whole value is then in the tooltip
export const DetailsValue = (props: {
  value: string;
  // What the value is to an Explorer; nothing for a Selector
  explorer?: ExplorerTarget["kind"];
  children?: ReactNode;
}) => {
  const { value, explorer, children } = props;
  const chainId = useContext(DetailsChainContext);
  const explorerUrl =
    explorer && getExplorerUrl(chainId, { kind: explorer, value });
  const shortened = children !== undefined;

  return (
    <span className="rpc-value">
      <span className="rpc-value-text" title={shortened ? value : undefined}>
        {children ?? value}
      </span>
      <span className="rpc-value-actions">
        <CopyButton text={value} label="Copy" />
        {explorerUrl && explorer && (
          <a
            className="rpc-value-action"
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            title={`Open in Explorer: ${explorerUrl}`}
            aria-label={`Open ${explorer} in Explorer`}
          >
            ↗
          </a>
        )}
      </span>
    </span>
  );
};
