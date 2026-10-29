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
  getRpcRequestStatus,
  isFailedRpcRequestStatus,
} from "../capture/getRpcRequestStatus.ts";
import { formatDuration } from "../table/rpcRequestRow.ts";
import { getDetailsTabs, getShownDetailsTab } from "../details/detailsTabs.ts";
import { getTabListScrollDelta } from "../details/tabListWheel.ts";
import { useKnownContracts } from "../hooks/useFindContract.ts";
import {
  findBuiltInContract,
  findBuiltInContractAt,
  getInnerCalls,
  getResultCountMismatch,
  InnerCall,
  ResultCountMismatch,
} from "../decoding/multicall.ts";
import {
  formatInnerCallFunction,
  formatResultCountMismatch,
  getInnerCallOutcome,
} from "../decoding/formatInnerCall.ts";
import { getRpcRequestRevert, Revert } from "../decoding/decodeRevert.ts";
import {
  formatRevert,
  formatRevertSource,
  formatRpcError,
} from "../decoding/formatRevert.ts";
import { getReturnData } from "../decoding/decodeRpcRequest.ts";
import { hasRpcParams } from "../details/hasRpcParams.ts";
import { formatHttpResponseBodyCut } from "../details/formatHttpResponseBody.ts";
import { useAbiFetchState } from "../hooks/useAbiFetchState.ts";
import { formatAbiFetchState } from "../abiSources/formatAbiFetchState.ts";
import { EtherscanApiKeyButton } from "./EtherscanApiKeyButton.tsx";
import {
  formatAddress,
  formatContractName,
  formatShortAddress,
} from "../details/formatAddress.ts";
import { formatInnerCallTargetTitle } from "../details/contractTab.ts";
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
import {
  formatBatchPosition,
  formatOverviewChain,
  formatOverviewStatus,
  getCallLine,
  getChainMethodCallLine,
  OverviewSegment,
} from "../details/overview.ts";
import {
  formatBlockParam,
  formatChainMethodResult,
  formatChainMethodResultInline,
  formatStateOverride,
  getNamedParams,
  ValueLine,
  ValuePart,
} from "../details/chainMethods.ts";
import { RpcRequestChain } from "../chains/endpointChains.ts";

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
  const contractName = contract && formatContractName(contract);
  const decoding = useMemo(
    () => (contract ? decodeRpcRequest(request, contract.abi) : undefined),
    [contract, request],
  );
  const { findContract, errorIndex } = useKnownContracts();
  const innerCalls = useMemo(
    () => getInnerCalls(request, findContract, errorIndex),
    [request, findContract, errorIndex],
  );
  // A custom error `to`'s ABI does not declare may have bubbled up from a
  // Multicall's Inner Call target, else from any other stored Contract
  const to = callParams?.to;
  const revert = useMemo(
    () =>
      getRpcRequestRevert(request, contract?.abi, {
        index: errorIndex,
        address: to,
        preferred: innerCalls?.map(({ target }) => target),
      }),
    [contract, request, errorIndex, to, innerCalls],
  );

  // By default the Contract tab is for `to`; Add ABI picks `to` or an Inner
  // Call target
  const contractTabAddress =
    contractTabTarget?.requestId === request.id
      ? contractTabTarget.address
      : callParams?.to;
  const showContractFor = (address: `0x${string}`, innerCallIndex?: number) =>
    showContractTab({ requestId: request.id, address, innerCallIndex });

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
              contractName={contractName}
              hasContract={!!contract}
              contractPending={contractQuery.isPending}
              chain={requestChain}
              decoding={decoding}
              revert={revert}
              innerCalls={innerCalls}
            />
          )}
          {shownTab === "Params" && (
            <Params
              request={request}
              callParams={callParams}
              hasContract={!!contract}
              contractPending={contractQuery.isPending}
              decoding={decoding}
              innerCalls={innerCalls}
              findContract={findContract}
              onAddAbi={showContractFor}
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
              {contractTabTarget?.requestId === request.id &&
                contractTabTarget.innerCallIndex !== undefined &&
                normalizeAddress(contractTabAddress) !==
                  normalizeAddress(callParams.to) && (
                  <div className="flex flex-row flex-wrap items-center gap-x-2 mb-2">
                    <span className="rpc-details-muted break-all">
                      {formatInnerCallTargetTitle(
                        contractTabTarget.innerCallIndex,
                        contractName || formatShortAddress(callParams.to),
                        callParams.to,
                      )}
                    </span>
                    <Button
                      size="small"
                      type="link"
                      onClick={() => showContractFor(callParams.to)}
                    >
                      Back to{" "}
                      {contractName || formatShortAddress(callParams.to)}
                    </Button>
                  </div>
                )}
              <ContractForm
                key={normalizeAddress(contractTabAddress)}
                contractAddress={contractTabAddress}
                endpoint={request.url}
                builtIn={findBuiltInContractAt(
                  contractTabAddress,
                  callParams,
                  innerCalls,
                )}
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

const StatusLabel = (props: { status: RpcRequestStatus; revert?: Revert }) => {
  const { status, revert } = props;
  return (
    <span
      className={
        isFailedRpcRequestStatus(status) ? "rpc-details-failed" : undefined
      }
    >
      <Segments segments={formatOverviewStatus(status, revert)} />
    </span>
  );
};

const Segments = ({ segments }: { segments: OverviewSegment[] }) =>
  segments.map(({ text, tone }, index) => (
    <span
      key={index}
      className={cx({
        "rpc-details-muted": tone === "muted",
        "rpc-details-failed": tone === "failed",
      })}
    >
      {text}
    </span>
  ));

// A formatted value: what copies or links has copy and ↗, the raw form and
// hints muted beside the main value
const ValueParts = ({ parts }: { parts: ValuePart[] }) =>
  parts.map((part, index) => (
    <span key={index} className={cx({ "rpc-details-muted": part.muted })}>
      {part.kind === "value" ? (
        <DetailsValue value={part.value} explorer={part.explorer}>
          {part.text === part.value ? undefined : part.text}
        </DetailsValue>
      ) : (
        part.text
      )}
    </span>
  ));

// What happened on one screen: what was called, where, and how it ended
const Overview = (props: {
  request: RpcRequest;
  callParams: ContractCall | undefined;
  contractName?: string;
  hasContract: boolean;
  contractPending: boolean;
  chain: RpcRequestChain;
  decoding: Decoding | undefined;
  revert: Revert | undefined;
  innerCalls: InnerCall[] | undefined;
}) => {
  const {
    request,
    callParams,
    contractName,
    hasContract,
    contractPending,
    chain,
    decoding,
    revert,
    innerCalls,
  } = props;
  const status = getRpcRequestStatus(request);
  const { method, params } = request.requestBody;
  const chainId = useContext(DetailsChainContext);
  const failed = isFailedRpcRequestStatus(status);
  const result = failed ? undefined : request.response?.result;
  const callLine = callParams
    ? getCallLine({
        data: callParams.data,
        decoding,
        innerCalls,
        hasContract,
        contractPending,
        failed,
        result: formatChainMethodResultInline(method, result, chainId),
      })
    : getChainMethodCallLine({ method, params, result, chainId, failed });

  const fields: [string, ReactNode][] = [
    ["Chain", <Segments segments={[formatOverviewChain(chain)]} />],
    ["Endpoint", request.url],
    ["Method", request.requestBody.method],
    ["Status", <StatusLabel status={status} revert={revert} />],
    ["HTTP status", request.httpStatus],
    ["Duration", formatDuration(request.time)],
    ["Started", new Date(request.startedDateTime).toLocaleString()],
    ["JSON-RPC id", JSON.stringify(request.requestBody.id ?? null)],
  ];
  if (request.batchPosition) {
    fields.push(["Batch", formatBatchPosition(request.batchPosition)]);
  }
  if (callParams) {
    fields.push([
      "Contract",
      <>
        {contractName && `${contractName} `}
        <DetailsValue value={formatAddress(callParams.to)} explorer="address" />
      </>,
    ]);
  }

  return (
    <>
      {callLine.length > 0 && (
        <div className="rpc-details-call-line">
          <Segments segments={callLine} />
        </div>
      )}
      <Fields fields={fields} />
    </>
  );
};

// For a called address without a Contract: `to` or an Inner Call target
const AbiFetch = (props: {
  endpoint: string;
  target: `0x${string}`;
  onAddAbi: (address: `0x${string}`) => void;
}) => {
  const { endpoint, target, onAddAbi } = props;
  const { state } = useAbiFetchState(endpoint, target);
  const label = formatAbiFetchState(state);
  return (
    <div className="rpc-details-abi-fetch">
      {label && (
        <span className="rpc-details-abi-fetch-state">
          <Segments segments={label.segments} />
          {label.openSettings && <EtherscanApiKeyButton />}
        </span>
      )}
      <Button size="small" onClick={() => onAddAbi(target)}>
        Add ABI
      </Button>
    </div>
  );
};

// The first two lines of an Inner Call, the same in Params and Response:
// #n, the Contract's name and the target, then the decoded call
const InnerCallHeading = ({
  innerCall,
  index,
}: {
  innerCall: InnerCall;
  index: number;
}) => (
  <>
    <div>
      <span className="rpc-details-muted">#{index + 1}</span>{" "}
      {innerCall.contractName && `${innerCall.contractName} `}
      <DetailsValue value={formatAddress(innerCall.target)} explorer="address">
        {formatShortAddress(innerCall.target)}
      </DetailsValue>
    </div>
    <div
      className={cx("rpc-details-decoded-value", {
        "rpc-details-muted": innerCall.decoding?.status !== "decoded",
      })}
    >
      {formatInnerCallFunction(innerCall)}
    </div>
  </>
);

// Params shows only what each Inner Call sends; its result is in Response
const InnerCalls = (props: {
  innerCalls: InnerCall[];
  endpoint: string;
  findContract: FindContract;
  onAddAbi: (address: `0x${string}`, innerCallIndex?: number) => void;
}) => {
  const { innerCalls, endpoint, findContract, onAddAbi } = props;

  return innerCalls.length === 0 ? (
    <div className="rpc-details-muted">No Inner Calls</div>
  ) : (
    <ol className="rpc-details-inner-calls">
      {innerCalls.map((innerCall, index) => (
        <li key={index} className="rpc-details-inner-call">
          <InnerCallHeading innerCall={innerCall} index={index} />
          {!findContract(innerCall.target) && (
            <AbiFetch
              endpoint={endpoint}
              target={innerCall.target}
              onAddAbi={(target) => onAddAbi(target, index)}
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
  // The stored Contract is still being read: no fetch state yet
  contractPending: boolean;
  decoding: Decoding | undefined;
  innerCalls: InnerCall[] | undefined;
  findContract: FindContract;
  onAddAbi: (address: `0x${string}`, innerCallIndex?: number) => void;
}) => {
  const {
    request,
    callParams,
    hasContract,
    contractPending,
    decoding,
    innerCalls,
    findContract,
    onAddAbi,
  } = props;

  if (!hasRpcParams(request.requestBody.params)) {
    return <div className="rpc-details-muted">No params</div>;
  }

  const { method, params } = request.requestBody;
  const namedParams = getNamedParams(method, params);
  // eth_call's and eth_estimateGas's block and state override follow the call
  const [, block, stateOverride] = callParams ? (params as unknown[]) : [];
  const overriddenAddresses = formatStateOverride(stateOverride);

  const selector = callParams?.data && (
    <DetailsValue value={callParams.data.slice(0, 10).toLowerCase()} />
  );

  const decodedInput = callParams && (
    <>
      <Fields
        fields={[
          ...(decoding?.status === "decoded"
            ? [["Function", decoding.signature] as [string, ReactNode]]
            : []),
          ...(selector ? [["Selector", selector] as [string, ReactNode]] : []),
          ...(block !== undefined
            ? [
                [
                  "Block",
                  <ValueParts parts={formatBlockParam(block).parts} />,
                ] as [string, ReactNode],
              ]
            : []),
          ...(overriddenAddresses
            ? [["State override", overriddenAddresses] as [string, ReactNode]]
            : []),
        ]}
      />
      {decoding?.status === "decoded" && (
        <DecodedValues values={decoding.args} empty="No arguments" />
      )}
      {decoding?.status === "mismatch" && (
        <DecodingMismatch>
          The Contract&apos;s ABI does not match this RPC Request
        </DecodingMismatch>
      )}
      {!decoding &&
        (!callParams.data ? (
          <div className="rpc-details-muted">
            This RPC Request sends no calldata
          </div>
        ) : hasContract ? (
          <div className="rpc-details-muted">Not decoded</div>
        ) : contractPending ? null : (
          <AbiFetch
            endpoint={request.url}
            target={callParams.to}
            onAddAbi={onAddAbi}
          />
        ))}
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
      {namedParams && namedParams.length > 0 && (
        <Section title="Params">
          <Fields
            fields={namedParams.map(({ name, parts }) => [
              name,
              <ValueParts parts={parts} />,
            ])}
          />
        </Section>
      )}
      <RawSection
        title="Raw params"
        code={() => formatCode(request.requestBody.params)}
        hasDecodedView={
          !!innerCalls ||
          decoding?.status === "decoded" ||
          !!namedParams?.length
        }
      />
    </>
  );
};

// The lines of a scalar Chain method's result; labelled when the value reads
// several ways
const ValueLines = ({ lines }: { lines: ValueLine[] }) =>
  lines.some(({ label }) => label) ? (
    <Fields
      fields={lines.map(({ label, parts }) => [
        label ?? "",
        <ValueParts parts={parts} />,
      ])}
    />
  ) : (
    lines.map(({ parts }, index) => (
      <div key={index} className="rpc-details-field-value">
        <ValueParts parts={parts} />
      </div>
    ))
  );

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
  const source = formatRevertSource(revert);
  return (
    <Section title="Decoded revert">
      <div className="rpc-details-revert">
        {revert.kind === "custom" ? (
          <>
            <div className="rpc-details-failed rpc-details-decoded-value">
              {revert.signature}
              {source && <span className="rpc-details-muted"> {source}</span>}
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
                <InnerCallHeading innerCall={innerCall} index={index} />
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
                    {outcome.revertSource && (
                      <span className="rpc-details-muted">
                        {" "}
                        {outcome.revertSource}
                      </span>
                    )}
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
  const chainId = useContext(DetailsChainContext);
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

  const valueLines = formatChainMethodResult(
    request.requestBody.method,
    result,
    chainId,
  );

  return (
    <>
      {valueLines && (
        <Section title="Value">
          <ValueLines lines={valueLines} />
        </Section>
      )}
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
          !!valueLines ||
          (decoding?.status === "decoded" && !!decoding.returnValues)
        }
      />
    </>
  );
};
