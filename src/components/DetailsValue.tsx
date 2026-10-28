import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { CheckOutlined, CloseOutlined, CopyOutlined } from "@ant-design/icons";
import { ExplorerTarget, getExplorerUrl } from "../chains/explorers.ts";
import { copyText } from "../utils/copyText.ts";

// The chain id of the shown RPC Request's Chain, when it is known
export const DetailsChainContext = createContext<number | undefined>(undefined);

const COPY_RESULTS = {
  copied: { title: "Copied", icon: <CheckOutlined /> },
  failed: { title: "Copy failed", icon: <CloseOutlined /> },
};

// A copy button that shows for a moment whether the value was copied. `text`
// may be a function, for a long value only built when copied
export const CopyButton = (props: {
  text: string | (() => string);
  label: string;
}) => {
  const { text, label } = props;
  const [result, setResult] = useState<keyof typeof COPY_RESULTS>();

  useEffect(() => {
    if (!result) {
      return;
    }
    const timer = setTimeout(() => setResult(undefined), 1200);
    return () => clearTimeout(timer);
  }, [result]);

  return (
    <button
      type="button"
      className="rpc-value-action"
      title={result ? COPY_RESULTS[result].title : label}
      aria-label={label}
      onClick={() =>
        copyText(typeof text === "function" ? text() : text).then(
          () => setResult("copied"),
          (error) => {
            console.error("Copy failed", error);
            setResult("failed");
          },
        )
      }
    >
      {result ? COPY_RESULTS[result].icon : <CopyOutlined />}
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
            className="rpc-value-action rpc-value-explorer"
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            title={`Open in Explorer: ${explorerUrl}`}
            aria-label={`Open ${explorer} in Explorer`}
          />
        )}
      </span>
    </span>
  );
};
