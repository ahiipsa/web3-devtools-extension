import { createContract, updateContract } from "../dal/contract.ts";
import { useEffect } from "react";
import { createABI, updateABI } from "../dal/abi.ts";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { useABIQuery } from "../hooks/useABIQuery.ts";
import { Button, Form, FormProps, Input, message } from "antd";

interface ContractInfoProps {
  contractAddress: `0x${string}`;
  onClose: (open: boolean) => void;
}

const isAbiJson = (value: string) => {
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
};

type FieldType = {
  contractName: string;
  abi: string;
};

export const ContractForm = (props: ContractInfoProps) => {
  const { contractAddress, onClose } = props;

  const contractQuery = useContractQuery({
    contractAddress,
  });

  const contract = contractQuery.data;
  const abiQuery = useABIQuery({ abiId: contract?.abiId || "" });
  const abi = abiQuery.data;

  const [form] = Form.useForm();

  useEffect(() => {
    form.resetFields();
  }, [contract, abi, form]);

  const [messageApi, messageContextHolder] = message.useMessage();

  const onFinish: FormProps<FieldType>["onFinish"] = async (values) => {
    try {
      if (!contract) {
        const newAbi = await createABI({ name: "", json: values.abi });
        await createContract({
          name: values.contractName,
          contractAddress,
          abiId: newAbi.id,
        });
      } else {
        await updateContract({
          contractAddress: contract.contractAddress,
          name: values.contractName,
        });
        if (abi) {
          await updateABI(abi.id, { name: "", json: values.abi });
        }
      }
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
          abi: abi?.json || "",
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
                validator: async (_rule, value) => {
                  if (value && !isAbiJson(value)) {
                    throw new Error("Invalid ABI format");
                  }
                },
              },
            ]}
          >
            <Input.TextArea />
          </Form.Item>
          <Form.Item label={null}>
            <div className="flex flex-row gap-4">
              <Button
                type="default"
                htmlType="reset"
                onClick={() => onClose(false)}
              >
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
