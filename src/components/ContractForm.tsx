import {
  deleteContract,
  formatAbiSummary,
  parseAbiInput,
  saveContract,
} from "../dal/contract.ts";
import { useContext, useEffect, useMemo, useState } from "react";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { Button, Form, FormProps, Input, message } from "antd";
import { useAbiFetchState } from "../hooks/useAbiFetchState.ts";
import { BuiltInContract } from "../decoding/multicall.ts";
import {
  getContractTabHeader,
  getContractTabKind,
} from "../details/contractTab.ts";
import { formatAddress } from "../details/formatAddress.ts";
import { AppContext } from "./AppContext.tsx";
import { DetailsValue } from "./DetailsValue.tsx";

interface ContractInfoProps {
  contractAddress: `0x${string}`;
  // The Endpoint of the RPC Request, whose Chain the ABI is fetched for; the
  // address is its `to` or one of its Inner Call targets
  endpoint: string;
  // The built-in ABI that decodes the calls to the address while it has no
  // Contract: Multicall3 for a Multicall
  builtIn?: BuiltInContract;
}

type FieldType = {
  contractName: string;
  abi: string;
};

const ABI_PLACEHOLDER = [
  'A JSON ABI array, a build artifact with an "abi" array (Hardhat, Foundry, Etherscan), or human-readable lines:',
  "function balanceOf(address owner) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "error InsufficientBalance(uint256 available)",
].join("\n");

// The summary under the ABI field once it parses; a parse error takes its
// place as the field's validation message
const getAbiSummary = (value: string | undefined) => {
  if (!value?.trim()) {
    return undefined;
  }
  try {
    return formatAbiSummary(parseAbiInput(value));
  } catch {
    return undefined;
  }
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const ContractForm = (props: ContractInfoProps) => {
  const { contractAddress, endpoint, builtIn } = props;
  const { settings } = useContext(AppContext);

  const contractQuery = useContractQuery({
    contractAddress,
  });

  const contract = contractQuery.data;
  const kind = getContractTabKind(contract, builtIn);
  const abiFetch = useAbiFetchState(endpoint, contractAddress);
  const header = getContractTabHeader({
    contract,
    builtIn,
    fetchState: abiFetch.state,
    hasEtherscanKey: !!settings.etherscanApiKey.trim(),
  });

  const [form] = Form.useForm<FieldType>();
  const abiValue = Form.useWatch("abi", form);
  const abiSummary = useMemo(() => getAbiSummary(abiValue), [abiValue]);

  // Inline confirmation instead of a browser confirm() dialog
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setConfirmingDelete(false);
    // A fetched Contract that lands while the user types keeps their edits
    if (contract?.source && form.isFieldsTouched()) {
      return;
    }
    form.resetFields();
  }, [contract, form]);

  const [messageApi, messageContextHolder] = message.useMessage();

  const shown = contract ?? builtIn;
  const initialValues: FieldType = {
    contractName: shown?.name || "",
    abi: shown ? JSON.stringify(shown.abi, null, 2) : "",
  };

  // Saving makes the Contract the user's own: no ABI Source, no proxy
  const onFinish: FormProps<FieldType>["onFinish"] = async (values) => {
    try {
      await saveContract({
        address: contractAddress,
        name: values.contractName,
        abi: parseAbiInput(values.abi),
      });
      messageApi.success("Contract saved");
    } catch (error) {
      messageApi.error(`Failed to save Contract: ${errorMessage(error)}`);
    }
  };

  // A fetched Contract is only forgotten until DevTools reopens: the ABI is
  // fetched once per Chain and address per Panel session
  const onDelete = async () => {
    const fetched = kind === "fetched";
    try {
      await deleteContract(contractAddress);
      messageApi.success(
        fetched ? "Fetched ABI forgotten" : "Contract deleted",
      );
    } catch (error) {
      messageApi.error(
        `Failed to ${fetched ? "forget the fetched ABI" : "delete Contract"}: ${errorMessage(error)}`,
      );
    } finally {
      setConfirmingDelete(false);
    }
  };

  return (
    <>
      {messageContextHolder}
      {contractQuery.isSuccess && (
        <div className="rpc-contract-header">
          <span className="rpc-contract-source">
            {header.segments.map(({ text, tone }, index) => (
              <span
                key={index}
                className={
                  tone === "failed" ? "rpc-details-failed" : "rpc-details-muted"
                }
              >
                {text}
              </span>
            ))}
            {header.implementation && (
              <DetailsValue
                value={formatAddress(header.implementation)}
                explorer="address"
              />
            )}
          </span>
          {header.fetchAbi && (
            <Button
              size="small"
              disabled={header.fetchAbi === "disabled"}
              onClick={() => void abiFetch.fetchAbi()}
            >
              Fetch ABI
            </Button>
          )}
        </div>
      )}
      <Form
        form={form}
        name="contract"
        layout="vertical"
        initialValues={initialValues}
        onFinish={onFinish}
        autoComplete="off"
      >
        <div className="flex flex-col gap-2">
          <Form.Item label="Address">
            <span className="rpc-contract-address">
              <DetailsValue
                value={formatAddress(contractAddress)}
                explorer="address"
              />
            </span>
          </Form.Item>

          <Form.Item<FieldType>
            label="Name"
            name="contractName"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>

          <Form.Item<FieldType>
            label="ABI"
            name="abi"
            extra={abiSummary}
            rules={[
              { required: true, message: "Required" },
              {
                // parseAbiInput's message is shown under the field
                validator: async (_rule, value) => {
                  if (value) {
                    parseAbiInput(value);
                  }
                },
              },
            ]}
          >
            <Input.TextArea
              className="rpc-contract-abi"
              rows={14}
              spellCheck={false}
              placeholder={ABI_PLACEHOLDER}
            />
          </Form.Item>
          <Form.Item label={null}>
            <div className="flex flex-row flex-wrap gap-2">
              {/* Discards unsaved edits; disabled while there are none */}
              <Form.Item<FieldType> noStyle shouldUpdate>
                {({ getFieldValue, isFieldsTouched }) => {
                  // Touched alone stays set after typing an edit back out;
                  // values alone differ for a moment while a Contract loads
                  const edited =
                    isFieldsTouched() &&
                    (getFieldValue("contractName") !==
                      initialValues.contractName ||
                      getFieldValue("abi") !== initialValues.abi);
                  return (
                    <Button type="default" htmlType="reset" disabled={!edited}>
                      Reset
                    </Button>
                  );
                }}
              </Form.Item>
              <Button type="primary" htmlType="submit">
                {kind === "fetched" || kind === "built-in"
                  ? "Save as mine"
                  : "Save"}
              </Button>
              {(kind === "own" || kind === "fetched") && !confirmingDelete && (
                <Button danger onClick={() => setConfirmingDelete(true)}>
                  {kind === "fetched" ? "Forget fetched ABI" : "Delete"}
                </Button>
              )}
            </div>
            {(kind === "own" || kind === "fetched") && confirmingDelete && (
              <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2 mt-4">
                <span>
                  {kind === "fetched"
                    ? "Forget the fetched ABI? It is fetched again the next time DevTools opens."
                    : "Delete this Contract? Its RPC Requests will no longer be decoded."}
                </span>
                <Button danger type="primary" onClick={onDelete}>
                  {kind === "fetched" ? "Forget" : "Yes, delete"}
                </Button>
                <Button onClick={() => setConfirmingDelete(false)}>Keep</Button>
              </div>
            )}
          </Form.Item>
        </div>
      </Form>
    </>
  );
};
