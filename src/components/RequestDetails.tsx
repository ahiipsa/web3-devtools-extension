import "./RequestDetails.css";
import cx from "classnames";
import {
  Fragment,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { ContractCall, RpcRequest } from "../types/main.ts";
import { AppContext } from "./AppContext.tsx";
import { ContractForm } from "./ContractForm.tsx";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { getContractCallParams, stringifyArgs } from "../utils/requestUtils.ts";
import {
  DecodedValue,
  decodeRpcRequest,
  Decoding,
} from "../decoding/decodeRpcRequest.ts";
import {
  formatRpcRequestStatus,
  getRpcRequestStatus,
  isFailedRpcRequestStatus,
} from "../capture/getRpcRequestStatus.ts";
import { formatDuration } from "../table/rpcRequestRow.ts";
import { getDetailsTabs, getShownDetailsTab } from "../details/detailsTabs.ts";
import { getTabListScrollDelta } from "../details/tabListWheel.ts";

interface RequestDetailsProps {
  request: RpcRequest;
  onClose: () => void;
}

export const RequestDetails = ({ request, onClose }: RequestDetailsProps) => {
  const { detailsTab, setDetailsTab } = useContext(AppContext);

  const callParams = getContractCallParams(request);
  const callsContract = callParams !== undefined;
  const tabs = getDetailsTabs(callsContract);
  const shownTab = getShownDetailsTab(detailsTab, callsContract);

  const contractQuery = useContractQuery({ contractAddress: callParams?.to });
  const contract = contractQuery.data ?? undefined;
  const decoding = useMemo(
    () => (contract ? decodeRpcRequest(request, contract.abi) : undefined),
    [contract, request],
  );

  const tabListRef = useRef<HTMLDivElement>(null);
  const shownTabRef = useRef<HTMLButtonElement>(null);

  // A narrow Panel scrolls the tab list; keep the shown tab in view, including one restored from the remembered selection
  useEffect(() => {
    shownTabRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [shownTab]);

  // Not a React onWheel: that listener is passive and cannot preventDefault
  useEffect(() => {
    const tabList = tabListRef.current;
    if (!tabList) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      const delta = getTabListScrollDelta(event, tabList.clientWidth);
      if (delta !== null && tabList.scrollWidth > tabList.clientWidth) {
        event.preventDefault();
        tabList.scrollLeft += delta;
      }
    };
    tabList.addEventListener("wheel", onWheel, { passive: false });
    return () => tabList.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="rpc-details">
      <div className="rpc-details-tab-bar">
        <button
          type="button"
          className="rpc-details-close"
          title="Close (Esc)"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
        <div className="rpc-details-tabs" role="tablist" ref={tabListRef}>
          {tabs.map((tab) => (
            <button
              key={tab}
              ref={tab === shownTab ? shownTabRef : undefined}
              type="button"
              role="tab"
              aria-selected={tab === shownTab}
              className={cx("rpc-details-tab", {
                "rpc-details-tab-selected": tab === shownTab,
              })}
              onClick={() => setDetailsTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="rpc-details-body" role="tabpanel">
        {shownTab === "Overview" && (
          <Overview
            request={request}
            callParams={callParams}
            contractName={contract?.name}
          />
        )}
        {shownTab === "Params" && (
          <Params
            request={request}
            callParams={callParams}
            hasContract={!!contract}
            decoding={decoding}
          />
        )}
        {shownTab === "Response" && (
          <Response request={request} decoding={decoding} />
        )}
        {shownTab === "Contract" && callParams && (
          <ContractForm
            key={callParams.to.toLowerCase()}
            contractAddress={callParams.to}
          />
        )}
      </div>
    </div>
  );
};

const Section = (props: { title: string; children: ReactNode }) => (
  <section className="rpc-details-section">
    <div className="rpc-details-section-title">{props.title}</div>
    {props.children}
  </section>
);

const Fields = (props: { fields: [string, ReactNode][] }) => (
  <div className="rpc-details-fields">
    {props.fields.map(([name, value]) => (
      <Fragment key={name}>
        <div className="rpc-details-field-name">{name}</div>
        <div className="rpc-details-field-value">{value}</div>
      </Fragment>
    ))}
  </div>
);

const Code = (props: { value: unknown }) => (
  <pre className="rpc-details-code">
    {props.value === undefined
      ? "undefined"
      : JSON.stringify(props.value, null, 2)}
  </pre>
);

const DecodedValues = (props: { values: DecodedValue[]; empty: string }) =>
  props.values.length === 0 ? (
    <div className="rpc-details-muted">{props.empty}</div>
  ) : (
    <div className="rpc-details-fields">
      {props.values.map(({ name, type, value }, index) => (
        <Fragment key={index}>
          <div className="rpc-details-field-name">
            {name} <span className="rpc-details-muted">{type}</span>
          </div>
          <div className="rpc-details-field-value rpc-details-decoded-value">
            {stringifyArgs(value)}
          </div>
        </Fragment>
      ))}
    </div>
  );

const DecodingMismatch = (props: { children: ReactNode }) => (
  <div className="rpc-details-failed">{props.children}</div>
);

const StatusLabel = ({ request }: { request: RpcRequest }) => {
  const status = getRpcRequestStatus(request);
  const label = formatRpcRequestStatus(status);
  if (!label) {
    return <span className="rpc-details-muted">No result or error</span>;
  }
  return (
    <span
      className={
        isFailedRpcRequestStatus(status) ? "rpc-details-failed" : undefined
      }
    >
      {status?.kind === "error" ? `${label}: ${status.message}` : label}
    </span>
  );
};

const Overview = (props: {
  request: RpcRequest;
  callParams: ContractCall | undefined;
  contractName?: string;
}) => {
  const { request, callParams, contractName } = props;

  const fields: [string, ReactNode][] = [
    ["Endpoint", request.url],
    ["Method", request.requestBody.method],
    ["JSON-RPC id", JSON.stringify(request.requestBody.id ?? null)],
    ["Status", <StatusLabel request={request} />],
    ["HTTP status", request.httpStatus],
    ["Duration", formatDuration(request.time)],
    ["Started", new Date(request.startedDateTime).toLocaleString()],
  ];
  if (callParams) {
    fields.push([
      "Contract",
      contractName ? `${contractName} (${callParams.to})` : callParams.to,
    ]);
  }

  return <Fields fields={fields} />;
};

const Params = (props: {
  request: RpcRequest;
  callParams: ContractCall | undefined;
  hasContract: boolean;
  decoding: Decoding | undefined;
}) => {
  const { request, callParams, hasContract, decoding } = props;

  return (
    <>
      {callParams && (
        <Section title="Decoded input">
          {callParams.data && (
            <Fields fields={[["Selector", callParams.data.slice(0, 10)]]} />
          )}
          {decoding?.status === "decoded" && (
            <>
              <Fields fields={[["Function", decoding.signature]]} />
              <DecodedValues values={decoding.args} empty="No arguments" />
            </>
          )}
          {decoding?.status === "mismatch" && (
            <DecodingMismatch>
              The Contract&apos;s ABI does not match this RPC Request
            </DecodingMismatch>
          )}
          {!decoding && (
            <div className="rpc-details-muted">
              {!callParams.data
                ? "This RPC Request sends no calldata"
                : hasContract
                  ? "Not decoded"
                  : "Add the Contract's ABI in the Contract tab to decode"}
            </div>
          )}
        </Section>
      )}
      <Section title="Raw params">
        <Code value={request.requestBody.params} />
      </Section>
    </>
  );
};

const ReturnValues = ({ values }: { values: DecodedValue[] }) => {
  // A single unnamed output needs no label
  if (values.length === 1 && values[0].name === "[0]") {
    return (
      <div className="rpc-details-field-value rpc-details-decoded-value">
        {stringifyArgs(values[0].value)}
      </div>
    );
  }
  return <DecodedValues values={values} empty="No return value" />;
};

const Response = (props: {
  request: RpcRequest;
  decoding: Decoding | undefined;
}) => {
  const { request, decoding } = props;
  const { response } = request;

  if (!response) {
    return (
      <>
        <StatusLabel request={request} />
        {request.hasRpcResponseBody && (
          <div className="rpc-details-muted">No RPC Response with this id</div>
        )}
      </>
    );
  }

  return (
    <>
      {decoding?.status === "decoded" && decoding.returnValues && (
        <Section title="Decoded return value">
          <ReturnValues values={decoding.returnValues} />
        </Section>
      )}
      {decoding?.status === "decoded" && decoding.returnValueMismatch && (
        <Section title="Decoded return value">
          <DecodingMismatch>
            The RPC Response does not match the Contract&apos;s ABI
          </DecodingMismatch>
        </Section>
      )}
      <Section title={response.error ? "Raw error" : "Raw result"}>
        <Code value={response.error ?? response.result} />
      </Section>
    </>
  );
};
