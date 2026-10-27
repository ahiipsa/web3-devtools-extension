import { deleteContract, parseAbiJson, saveContract } from "../dal/contract.ts";
import { useEffect, useState } from "react";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { Button, Form, FormProps, Input, message } from "antd";
import { useAbiFetchState } from "../hooks/useAbiFetchState.ts";
import { AbiFetchState } from "../abiSources/abiFetcher.ts";
import { AbiSourceName } from "../abiSources/abiSources.ts";

interface ContractInfoProps {
  contractAddress: `0x${string}`;
  // The Endpoint of the RPC Request, whose Chain the ABI is fetched for
  endpoint: string;
}

const ABI_SOURCE_NAMES: Record<AbiSourceName, string> = {
  sourcify: "Sourcify",
  etherscan: "Etherscan",
};

const formatAbiFetchState = (state: AbiFetchState) => {
  switch (state.kind) {
    case "fetching":
      return "Fetching ABI…";
    case "not-found":
      // The ABI Sources asked, not those that would be asked now
      return `No verified ABI on ${state.sources.map((source) => ABI_SOURCE_NAMES[source]).join(" or ")}`;
    case "failed":
      return `Fetch failed: ${state.reason}`;
    case "idle":
      return undefined;
  }
};

type FieldType = {
  contractName: string;
  abi: string;
};

export const ContractForm = (props: ContractInfoProps) => {
  const { contractAddress, endpoint } = props;

  const contractQuery = useContractQuery({
    contractAddress,
  });

  const contract = contractQuery.data;
  const abiFetch = useAbiFetchState(endpoint, contractAddress);
  const abiFetchLabel = formatAbiFetchState(abiFetch.state);

  const [form] = Form.useForm();

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

  const initialValues: FieldType = {
    contractName: contract?.name || "",
    abi: contract ? JSON.stringify(contract.abi, null, 2) : "",
  };

  const onFinish: FormProps<FieldType>["onFinish"] = async (values) => {
    try {
      await saveContract({
        address: contractAddress,
        name: values.contractName,
        abi: parseAbiJson(values.abi),
      });
      messageApi.success("Contract saved");
    } catch (error) {
      messageApi.error(
        `Failed to save Contract: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const onDelete = async () => {
    try {
      await deleteContract(contractAddress);
      messageApi.success("Contract deleted");
    } catch (error) {
      messageApi.error(
        `Failed to delete Contract: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setConfirmingDelete(false);
    }
  };

  return (
    <>
      {messageContextHolder}
      {contract?.source && (
        <div className="rpc-details-muted mb-2">
          From {ABI_SOURCE_NAMES[contract.source]}
        </div>
      )}
      {/* Only for an address without a Contract; the form stays usable */}
      {contractQuery.isSuccess && !contract && (
        <div className="flex flex-row items-center gap-4 mb-4">
          {abiFetchLabel && (
            <span
              className={
                abiFetch.state.kind === "failed"
                  ? "rpc-details-failed"
                  : "rpc-details-muted"
              }
            >
              {abiFetchLabel}
            </span>
          )}
          <Button
            size="small"
            disabled={abiFetch.state.kind === "fetching"}
            onClick={() => void abiFetch.fetchAbi()}
          >
            Fetch ABI
          </Button>
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
          <Form.Item<FieldType>
            label="Contract Name"
            name="contractName"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>

          <Form.Item<FieldType>
            label="ABI"
            name="abi"
            rules={[
              { required: true, message: "Required" },
              {
                // parseAbiJson's message is shown under the field
                validator: async (_rule, value) => {
                  if (value) {
                    parseAbiJson(value);
                  }
                },
              },
            ]}
          >
            <Input.TextArea />
          </Form.Item>
          <Form.Item label={null}>
            <div className="flex flex-row gap-4">
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
                Save
              </Button>
              {contract && !confirmingDelete && (
                <Button danger onClick={() => setConfirmingDelete(true)}>
                  Delete
                </Button>
              )}
            </div>
            {contract && confirmingDelete && (
              <div className="flex flex-row items-center gap-4 mt-4">
                <span>
                  Delete this Contract? Its RPC Requests will no longer be
                  decoded.
                </span>
                <Button danger type="primary" onClick={onDelete}>
                  Yes, delete
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
