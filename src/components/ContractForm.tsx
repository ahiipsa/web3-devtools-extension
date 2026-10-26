import { parseAbiJson, saveContract } from "../dal/contract.ts";
import { useEffect } from "react";
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

  useEffect(() => {
    form.resetFields();
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
            </div>
          </Form.Item>
        </div>
      </Form>
    </>
  );
};
