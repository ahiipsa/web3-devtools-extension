import "./RequestDetails.css";
import cx from "classnames";
import {
  Fragment,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "antd";
import {
  ContractCall,
  RpcRequest,
  RpcRequestStatus,
  RpcResponseBody,
} from "../types/main.ts";
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
  formatInnerCallFunctionName,
  formatResultCountMismatch,
  getInnerCallOutcome,
} from "../decoding/formatInnerCall.ts";
import { getRpcRequestRevert, Revert } from "../decoding/decodeRevert.ts";
import { formatRevert, formatRpcError } from "../decoding/formatRevert.ts";
import { getReturnData } from "../decoding/decodeRpcRequest.ts";
import { formatHttpResponseBodyCut } from "../details/formatHttpResponseBody.ts";
import { useAbiFetchState } from "../hooks/useAbiFetchState.ts";
import { formatAbiFetchState } from "../abiSources/formatAbiFetchState.ts";
import { trimContractAddress } from "../utils/text.ts";
import { formatAddress, formatShortAddress } from "../details/formatAddress.ts";
import {
  isRawSectionOpen,
  loadRawSectionFolds,
  RawSectionTitle,
  saveRawSectionFold,
} from "../details/rawSectionStorage.ts";
import {
  CopyButton,
  DetailsChainContext,
  DetailsValue,
} from "./DetailsValue.tsx";

interface RequestDetailsProps {
  request: RpcRequest;
  onClose: () => void;
}

export const RequestDetails = ({ request, onClose }: RequestDetailsProps) => {
  const {
    detailsTab,
    setDetailsTab,
    contractTabTarget,
    showContractTab,
    endpointChains,
  } = useContext(AppContext);
  // Explorer links follow the Chain the RPC Request was sent to
  const requestChain = useSyncExternalStore(endpointChains.subscribe, () =>
    endpointChains.getRequestChain(request),
  );
  const chainId =
    requestChain.kind === "known" ? requestChain.chainId : undefined;

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
  const revert = useMemo(
    () => getRpcRequestRevert(request, contract?.abi),
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
    <DetailsChainContext.Provider value={chainId}>
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
            <Response
              request={request}
              decoding={decoding}
              revert={revert}
              innerCalls={innerCalls}
            />
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
    </DetailsChainContext.Provider>
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

const formatCode = (value: unknown) =>
  value === undefined ? "undefined" : JSON.stringify(value, null, 2);

// Each RawSection reads the folds when it mounts and saves the user's choice
const getStorage = () => window.localStorage;

// Raw JSON or text, foldable, with copy in its header. Folded by default
// beside a decoded view of the same data; the user's fold or unfold is
// remembered. `code` builds the text only when shown or copied
const RawSection = (props: {
  title: RawSectionTitle;
  code: () => string;
  hasDecodedView: boolean;
}) => {
  const { title, code, hasDecodedView } = props;
  const [folds, setFolds] = useState(() => loadRawSectionFolds(getStorage()));
  const open = isRawSectionOpen(folds, title, hasDecodedView);

  return (
    <section className="rpc-details-section">
      <div className="rpc-details-section-title rpc-details-raw-title">
        <button
          type="button"
          className="rpc-details-fold"
          aria-expanded={open}
          onClick={() =>
            setFolds(
              saveRawSectionFold(getStorage(), title, hasDecodedView, !open),
            )
          }
        >
          <span className="rpc-details-fold-arrow" aria-hidden="true">
            {open ? "▼" : "▶"}
          </span>
          {title}
        </button>
        <CopyButton text={code} label={`Copy ${title.toLowerCase()}`} />
      </div>
      {open && <pre className="rpc-details-code">{code()}</pre>}
    </section>
  );
};

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
            {type === "address" && typeof value === "string" ? (
              <DetailsValue value={formatAddress(value)} explorer="address" />
            ) : (
              formatDecodedValue(value)
            )}
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
      <>
        {contractName && `${contractName} `}
        <DetailsValue value={formatAddress(callParams.to)} explorer="address" />
      </>,
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

const InnerCallTarget = ({ target }: { target: `0x${string}` }) => (
  <DetailsValue value={formatAddress(target)} explorer="address">
    {formatShortAddress(target)}
  </DetailsValue>
);

// Params shows only what each Inner Call sends; its result is in Response
const InnerCalls = (props: {
  innerCalls: InnerCall[];
  endpoint: string;
  findContract: FindContract;
  onAddAbi: (address: `0x${string}`) => void;
}) => {
  const { innerCalls, endpoint, findContract, onAddAbi } = props;

  return innerCalls.length === 0 ? (
    <div className="rpc-details-muted">No Inner Calls</div>
  ) : (
    <ol className="rpc-details-inner-calls">
      {innerCalls.map((innerCall, index) => (
        <li key={index} className="rpc-details-inner-call">
          <div>
            <span className="rpc-details-muted">#{index + 1}</span>{" "}
            {innerCall.contractName && `${innerCall.contractName} `}
            <InnerCallTarget target={innerCall.target} />
          </div>
          <div
            className={cx("rpc-details-decoded-value", {
              "rpc-details-muted": innerCall.decoding?.status !== "decoded",
            })}
          >
            {formatInnerCallFunction(innerCall)}
          </div>
          {!findContract(innerCall.target) && (
            <InnerCallAbiFetch
              endpoint={endpoint}
              target={innerCall.target}
              onAddAbi={onAddAbi}
            />
          )}
        </li>
      ))}
    </ol>
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

  const decodedInput = callParams && (
    <>
      {callParams.data && (
        <Fields
          fields={[
            [
              "Selector",
              <DetailsValue
                value={callParams.data.slice(0, 10).toLowerCase()}
              />,
            ],
          ]}
        />
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
      <RawSection
        title="Raw params"
        code={() => formatCode(request.requestBody.params)}
        hasDecodedView={!!innerCalls || decoding?.status === "decoded"}
      />
    </>
  );
};

// The calls that return a transaction hash
const TRANSACTION_HASH_METHODS = [
  "eth_sendRawTransaction",
  "eth_sendTransaction",
];

// The HTTP response body of an RPC Request without a valid RPC Response
const HttpResponseBodySection = ({ request }: { request: RpcRequest }) => {
  const body = request.httpResponseBody;
  if (!body?.length) {
    return null;
  }
  const cut = formatHttpResponseBodyCut(body);
  return (
    <>
      <RawSection
        title="Raw HTTP body"
        code={() => body.text}
        hasDecodedView={false}
      />
      {cut && <div className="rpc-details-muted">{cut}</div>}
    </>
  );
};

const DecodedRevert = (props: {
  revert: Revert;
  error: NonNullable<RpcResponseBody["error"]>;
}) => {
  const { revert, error } = props;
  return (
    <Section title="Decoded revert">
      <div className="rpc-details-revert">
        {revert.kind === "custom" ? (
          <>
            <div className="rpc-details-failed rpc-details-decoded-value">
              {revert.signature}
            </div>
            <DecodedValues values={revert.args} empty="No arguments" />
          </>
        ) : (
          <div className="rpc-details-failed rpc-details-decoded-value">
            {formatRevert(revert)}
          </div>
        )}
      </div>
      <div className="rpc-details-muted">{formatRpcError(error)}</div>
    </Section>
  );
};

// Each Inner Call's outcome, numbered like the Inner Calls in Params
const InnerCallResults = (props: {
  innerCalls: InnerCall[];
  resultCountMismatch: ResultCountMismatch | undefined;
  // The return data is not the aggregator's: no Inner Call has a result
  returnValueMismatch: boolean;
}) => {
  const { innerCalls, resultCountMismatch, returnValueMismatch } = props;
  return (
    <Section title="Inner Call results">
      {returnValueMismatch && (
        <DecodingMismatch>
          The RPC Response does not match the Contract&apos;s ABI
        </DecodingMismatch>
      )}
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
            const outcome = getInnerCallOutcome(innerCall);
            return (
              <li key={index} className="rpc-details-inner-call">
                <div>
                  <span className="rpc-details-muted">#{index + 1}</span>{" "}
                  <InnerCallTarget target={innerCall.target} />{" "}
                  <span
                    className={cx({
                      "rpc-details-muted":
                        innerCall.decoding?.status !== "decoded",
                    })}
                  >
                    {formatInnerCallFunctionName(innerCall)}
                  </span>
                </div>
                {outcome.kind === "succeeded" &&
                  (outcome.decoded ? (
                    <div className="rpc-details-decoded-value">
                      ✓ {outcome.value}
                    </div>
                  ) : (
                    // Clipped to one line; the full value is in the tooltip
                    <div className="rpc-details-clipped" title={outcome.value}>
                      ✓ {outcome.value}
                    </div>
                  ))}
                {outcome.kind === "failed" && (
                  <div className="rpc-details-failed rpc-details-decoded-value">
                    ✗{outcome.revert !== undefined && ` ${outcome.revert}`}
                  </div>
                )}
                {outcome.kind === "none" && (
                  <div className="rpc-details-muted">no result</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
};

const Response = (props: {
  request: RpcRequest;
  decoding: Decoding | undefined;
  revert: Revert | undefined;
  innerCalls: InnerCall[] | undefined;
}) => {
  const { request, decoding, revert, innerCalls } = props;
  const { response } = request;
  const status = getRpcRequestStatus(request);
  const resultCountMismatch = useMemo(
    () => getResultCountMismatch(request),
    [request],
  );

  if (!response) {
    return (
      <>
        <StatusLabel status={status} />
        {request.hasRpcResponseBody && (
          <div className="rpc-details-muted">No RPC Response with this id</div>
        )}
        <HttpResponseBodySection request={request} />
      </>
    );
  }

  if (status.kind === "invalid-response") {
    return (
      <>
        <StatusLabel status={status} />
        <RawSection
          title="Raw response"
          code={() => formatCode(response)}
          hasDecodedView={false}
        />
        <HttpResponseBodySection request={request} />
      </>
    );
  }

  if (response.error) {
    // Revert data that does not decode leaves Raw error the only view
    const decodedRevert = revert && revert.kind !== "raw" ? revert : undefined;
    return (
      <>
        {decodedRevert && (
          <DecodedRevert revert={decodedRevert} error={response.error} />
        )}
        <RawSection
          title="Raw error"
          code={() => formatCode(response.error)}
          hasDecodedView={!!decodedRevert}
        />
      </>
    );
  }

  const rawResult = () => formatCode(response.result);

  // A Multicall's results are per Inner Call, in place of its aggregator's
  // return value
  if (innerCalls && getReturnData(request) !== undefined) {
    return (
      <>
        <InnerCallResults
          innerCalls={innerCalls}
          resultCountMismatch={resultCountMismatch}
          returnValueMismatch={
            decoding?.status === "decoded" && !!decoding.returnValueMismatch
          }
        />
        <RawSection
          title="Raw result"
          code={rawResult}
          hasDecodedView={innerCalls.some(
            ({ returnData }) => returnData !== undefined,
          )}
        />
      </>
    );
  }

  const { result } = response;
  if (
    TRANSACTION_HASH_METHODS.includes(request.requestBody.method) &&
    typeof result === "string"
  ) {
    return (
      <>
        <Fields
          fields={[
            [
              "Transaction hash",
              <DetailsValue value={result} explorer="transaction" />,
            ],
          ]}
        />
        <RawSection title="Raw result" code={rawResult} hasDecodedView />
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
      <RawSection
        title="Raw result"
        code={rawResult}
        hasDecodedView={
          decoding?.status === "decoded" && !!decoding.returnValues
        }
      />
    </>
  );
};
