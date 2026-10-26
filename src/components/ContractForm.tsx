import { deleteContract, parseAbiJson, saveContract } from "../dal/contract.ts";
import { useEffect, useState } from "react";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { Button, Form, FormProps, Input, message } from "antd";

interface ContractInfoProps {
  contractAddress: `0x${string}`;
}

type FieldType = {
  contractName: string;
  abi: string;
};

export const ContractForm = (props: ContractInfoProps) => {
  const { contractAddress } = props;

  const contractQuery = useContractQuery({
    contractAddress,
  });

  const contract = contractQuery.data;

  const [form] = Form.useForm();

  // Inline confirmation instead of a browser confirm() dialog
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    form.resetFields();
    setConfirmingDelete(false);
  }, [contract, form]);

  const [messageApi, messageContextHolder] = message.useMessage();

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
        `Failed to save contract: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const onDelete = async () => {
    try {
      await deleteContract(contractAddress);
      messageApi.success("Contract deleted");
    } catch (error) {
      messageApi.error(
        `Failed to delete contract: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setConfirmingDelete(false);
    }
  };

  return (
    <>
      {messageContextHolder}
      <Form
        form={form}
        name="contract"
        layout="vertical"
        initialValues={{
          contractName: contract?.name || "",
          abi: contract ? JSON.stringify(contract.abi, null, 2) : "",
        }}
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
              {/* Discards unsaved edits */}
              <Button type="default" htmlType="reset">
                Cancel
              </Button>
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
