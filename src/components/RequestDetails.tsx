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
import { Button } from "antd";
import { ContractCall, RpcRequest, RpcRequestStatus } from "../types/main.ts";
import { FindContract, normalizeAddress } from "../dal/contract.ts";
import { AppContext } from "./AppContext.tsx";
import { ContractForm } from "./ContractForm.tsx";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { getContractCallParams } from "../utils/requestUtils.ts";
import { formatDecodedValue } from "../decoding/formatDecodedValue.ts";
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
import { useFindContract } from "../hooks/useFindContract.ts";
import {
  findBuiltInContract,
  getInnerCalls,
  getResultCountMismatch,
  InnerCall,
  ResultCountMismatch,
} from "../decoding/multicall.ts";
import {
  formatInnerCallFunction,
  formatInnerCallRawResult,
  formatInnerCallResult,
  formatInnerCallRevert,
  formatInnerCallTarget,
  formatResultCountMismatch,
} from "../decoding/formatInnerCall.ts";
import { useAbiFetchState } from "../hooks/useAbiFetchState.ts";
import { formatAbiFetchState } from "../abiSources/formatAbiFetchState.ts";
import { trimContractAddress } from "../utils/text.ts";

interface RequestDetailsProps {
  request: RpcRequest;
  onClose: () => void;
}

export const RequestDetails = ({ request, onClose }: RequestDetailsProps) => {
  const { detailsTab, setDetailsTab, contractTabTarget, showContractTab } =
    useContext(AppContext);

  const callParams = getContractCallParams(request);
  const callsContract = callParams !== undefined;
  const tabs = getDetailsTabs(callsContract);
  const shownTab = getShownDetailsTab(detailsTab, callsContract);

  const contractQuery = useContractQuery({ contractAddress: callParams?.to });
  // Without a Contract, a Multicall still decodes with the built-in aggregator ABI
  const contract = contractQuery.data ?? findBuiltInContract(callParams?.data);
  const decoding = useMemo(
    () => (contract ? decodeRpcRequest(request, contract.abi) : undefined),
    [contract, request],
  );
  const findContract = useFindContract();
  const innerCalls = useMemo(
    () => getInnerCalls(request, findContract),
    [request, findContract],
  );

  // By default the Contract tab is for `to`; Add ABI picks an Inner Call target
  const contractTabAddress =
    contractTabTarget?.requestId === request.id
      ? contractTabTarget.address
      : callParams?.to;
  const showInnerCallContract = (address: `0x${string}`) =>
    showContractTab({ requestId: request.id, address });

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
            innerCalls={innerCalls}
            findContract={findContract}
            onAddAbi={showInnerCallContract}
          />
        )}
        {shownTab === "Response" && (
          <Response request={request} decoding={decoding} />
        )}
        {shownTab === "Contract" && callParams && contractTabAddress && (
          <>
            {normalizeAddress(contractTabAddress) !==
              normalizeAddress(callParams.to) && (
              <div className="flex flex-row flex-wrap items-center gap-x-2 mb-2">
                <span className="rpc-details-muted break-all">
                  Inner Call target {contractTabAddress}
                </span>
                <Button
                  size="small"
                  type="link"
                  onClick={() => showInnerCallContract(callParams.to)}
                >
                  Back to {trimContractAddress(callParams.to)}
                </Button>
              </div>
            )}
            <ContractForm
              key={normalizeAddress(contractTabAddress)}
              contractAddress={contractTabAddress}
              endpoint={request.url}
            />
          </>
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
            {name && `${name} `}
            <span className="rpc-details-muted">{type}</span>
          </div>
          <div className="rpc-details-field-value rpc-details-decoded-value">
            {formatDecodedValue(value)}
          </div>
        </Fragment>
      ))}
    </div>
  );

const DecodingMismatch = (props: { children: ReactNode }) => (
  <div className="rpc-details-failed">{props.children}</div>
);

const StatusLabel = ({ status }: { status: RpcRequestStatus }) => {
  const label = formatRpcRequestStatus(status);
  return (
    <span
      className={
        isFailedRpcRequestStatus(status) ? "rpc-details-failed" : undefined
      }
    >
      {status.kind === "error" ? `${label}: ${status.message}` : label}
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
    ["Status", <StatusLabel status={getRpcRequestStatus(request)} />],
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

// For an Inner Call target without a Contract
const InnerCallAbiFetch = (props: {
  endpoint: string;
  target: `0x${string}`;
  onAddAbi: (address: `0x${string}`) => void;
}) => {
  const { endpoint, target, onAddAbi } = props;
  const { state } = useAbiFetchState(endpoint, target);
  const label = formatAbiFetchState(state);
  return (
    <div className="rpc-details-inner-call-abi">
      {label && (
        <span
          className={
            state.kind === "failed" ? "rpc-details-failed" : "rpc-details-muted"
          }
        >
          {label}
        </span>
      )}
      <Button size="small" onClick={() => onAddAbi(target)}>
        Add ABI
      </Button>
    </div>
  );
};

const InnerCalls = (props: {
  innerCalls: InnerCall[];
  resultCountMismatch: ResultCountMismatch | undefined;
  endpoint: string;
  findContract: FindContract;
  onAddAbi: (address: `0x${string}`) => void;
}) => {
  const { innerCalls, resultCountMismatch, endpoint, findContract, onAddAbi } =
    props;

  return (
    <>
      {resultCountMismatch && (
        <DecodingMismatch>
          {formatResultCountMismatch(resultCountMismatch)}
        </DecodingMismatch>
      )}
      {innerCalls.length === 0 ? (
        <div className="rpc-details-muted">No Inner Calls</div>
      ) : (
        <ol className="rpc-details-inner-calls">
          {innerCalls.map((innerCall, index) => {
            const result = formatInnerCallResult(innerCall);
            const rawResult = formatInnerCallRawResult(innerCall);
            const revert = formatInnerCallRevert(innerCall);
            return (
              <li key={index} className="rpc-details-inner-call">
                <div>
                  <span className="rpc-details-muted">#{index + 1}</span>{" "}
                  <span title={innerCall.target}>
                    {formatInnerCallTarget(innerCall)}
                  </span>
                  {innerCall.success === false && (
                    <span
                      className="rpc-details-failed"
                      title={revert ?? "Failed"}
                    >
                      {" "}
                      ✗{revert !== undefined && ` ${revert}`}
                    </span>
                  )}
                </div>
                <div
                  className={cx("rpc-details-decoded-value", {
                    "rpc-details-muted":
                      innerCall.decoding?.status !== "decoded",
                  })}
                >
                  {formatInnerCallFunction(innerCall)}
                </div>
                {result !== undefined && (
                  <div className="rpc-details-decoded-value">→ {result}</div>
                )}
                {/* Clipped to one line; the full value is in the tooltip and copies whole */}
                {rawResult !== undefined && (
                  <div className="rpc-details-clipped" title={rawResult}>
                    → {rawResult}
                  </div>
                )}
                {!findContract(innerCall.target) && (
                  <InnerCallAbiFetch
                    endpoint={endpoint}
                    target={innerCall.target}
                    onAddAbi={onAddAbi}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
};

const Params = (props: {
  request: RpcRequest;
  callParams: ContractCall | undefined;
  hasContract: boolean;
  decoding: Decoding | undefined;
  innerCalls: InnerCall[] | undefined;
  findContract: FindContract;
  onAddAbi: (address: `0x${string}`) => void;
}) => {
  const {
    request,
    callParams,
    hasContract,
    decoding,
    innerCalls,
    findContract,
    onAddAbi,
  } = props;

  const resultCountMismatch = useMemo(
    () => getResultCountMismatch(request),
    [request],
  );

  const decodedInput = callParams && (
    <>
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
    </>
  );

  return (
    <>
      {innerCalls ? (
        <>
          <Section title="Inner Calls">
            <InnerCalls
              innerCalls={innerCalls}
              resultCountMismatch={resultCountMismatch}
              endpoint={request.url}
              findContract={findContract}
              onAddAbi={onAddAbi}
            />
          </Section>
          {/* A Multicall's raw decoded input is one long tuple: kept, folded */}
          <details className="rpc-details-section rpc-details-collapsible">
            <summary className="rpc-details-section-title">
              Decoded input
            </summary>
            {decodedInput}
          </details>
        </>
      ) : (
        decodedInput && <Section title="Decoded input">{decodedInput}</Section>
      )}
      <Section title="Raw params">
        <Code value={request.requestBody.params} />
      </Section>
    </>
  );
};

const Response = (props: {
  request: RpcRequest;
  decoding: Decoding | undefined;
}) => {
  const { request, decoding } = props;
  const { response } = request;
  const status = getRpcRequestStatus(request);

  if (!response) {
    return (
      <>
        <StatusLabel status={status} />
        {request.hasRpcResponseBody && (
          <div className="rpc-details-muted">No RPC Response with this id</div>
        )}
      </>
    );
  }

  if (status.kind === "invalid-response") {
    return (
      <>
        <StatusLabel status={status} />
        <Section title="Raw response">
          <Code value={response} />
        </Section>
      </>
    );
  }

  return (
    <>
      {decoding?.status === "decoded" && decoding.returnValues && (
        <Section title="Decoded return value">
          <DecodedValues
            values={decoding.returnValues}
            empty="No return value"
          />
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
