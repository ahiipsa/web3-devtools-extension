import "./RequestDetails.css";
import cx from "classnames";
import { Fragment, ReactNode, useContext, useMemo } from "react";
import { ContractCall, RpcRequest } from "../types/main.ts";
import { AppContext } from "./AppContext.tsx";
import { ContractForm } from "./ContractForm.tsx";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { getContractCallParams, stringifyArgs } from "../utils/requestUtils.ts";
import { decodeRpcRequest, Decoding } from "../decoding/decodeRpcRequest.ts";
import { getRpcRequestStatus } from "../capture/getRpcRequestStatus.ts";
import { formatDuration } from "../table/rpcRequestRow.ts";
import { getDetailsTabs, getShownDetailsTab } from "../details/detailsTabs.ts";

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

  return (
    <div className="rpc-details">
      <div className="rpc-details-tabs" role="tablist">
        <button
          type="button"
          className="rpc-details-close"
          title="Close (Esc)"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
        {tabs.map((tab) => (
          <button
            key={tab}
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

const DecodingMismatch = (props: { children: ReactNode }) => (
  <div className="rpc-details-failed">{props.children}</div>
);

const StatusLabel = ({ request }: { request: RpcRequest }) => {
  const status = getRpcRequestStatus(request);
  switch (status?.kind) {
    case "ok":
      return <span>ok</span>;
    case "error":
      return (
        <span className="rpc-details-failed">
          {`error ${status.code}: ${status.message}`}
        </span>
      );
    case "http":
      return (
        <span className="rpc-details-failed">{`HTTP ${status.code}`}</span>
      );
    default:
      return (
        <span className="rpc-details-muted">
          {request.hasRpcResponseBody
            ? "No RPC Response with this id"
            : "No RPC Response"}
        </span>
      );
  }
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
            <Fields
              fields={[
                ["Function", decoding.signature],
                ["Arguments", stringifyArgs(decoding.args)],
              ]}
            />
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

const Response = (props: {
  request: RpcRequest;
  decoding: Decoding | undefined;
}) => {
  const { request, decoding } = props;
  const { response } = request;

  if (!response) {
    return <StatusLabel request={request} />;
  }

  return (
    <>
      {decoding?.status === "decoded" && "returnValue" in decoding && (
        <Section title="Decoded return value">
          <div className="rpc-details-field-value">
            {stringifyArgs(decoding.returnValue)}
          </div>
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
