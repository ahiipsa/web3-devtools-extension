import { RpcRequestEstimateGas, RpcRequestCall } from "../types/main.ts";
import { createContract, updateContract } from "../dal/contract.ts";
import { useEffect } from "react";
import { createABI, updateABI } from "../dal/abi.ts";
import { useContractQuery } from "../hooks/useContractQuery.ts";
import { useABIQuery } from "../hooks/useABIQuery.ts";
import { Button, FormProps } from "antd";
import { Form, Input } from "antd";
import { getContractCallParams } from "../utils/requestUtils.ts";

interface ContractInfoProps {
  rpcRequest: RpcRequestCall | RpcRequestEstimateGas;
  onClose: (open: boolean) => void;
}

type FieldType = {
  contractName: string;
  abi: string;
};

export const ContractForm = (props: ContractInfoProps) => {
  const { rpcRequest, onClose } = props;

  const callParams = getContractCallParams(rpcRequest);

  const contractQuery = useContractQuery({
    contractAddress: callParams.to,
  });

  const contract = contractQuery.data;
  const abiQuery = useABIQuery({ abiId: contract?.abiId || "" });
  const abi = abiQuery.data;

  const [form] = Form.useForm();

  useEffect(() => {
    form.resetFields();
  }, [contract, abi, form]);

  const onFinish: FormProps<FieldType>["onFinish"] = async (values) => {
    if (!contract) {
      try {
        const newAbi = await createABI({ name: "", json: values.abi });
        await createContract({
          name: values.contractName,
          contractAddress: callParams.to,
          abiId: newAbi.id,
        });

        console.log("### saved");
      } catch (error) {
        console.log("### error", error);
      }
    } else {
      try {
        await updateContract({
          contractAddress: contract.contractAddress,
          name: values.contractName,
        });
        if (abi) {
          console.log("### update abi", values.abi);
          await updateABI(abi.id, { name: "", json: values.abi });
        }
      } catch (error) {
        console.log("### error", error);
      }
    }
  };

  const onFinishFailed: FormProps<FieldType>["onFinishFailed"] = (
    errorInfo,
  ) => {
    console.log("Failed:", errorInfo);
  };

  return (
    /* "handleSubmit" will validate your inputs before invoking "onSubmit" */
    <Form
      form={form}
      name="basic"
      layout="vertical"
      initialValues={{
        contractName: contract?.name || "",
        abi: abi?.json || "",
      }}
      onFinish={onFinish}
      onFinishFailed={onFinishFailed}
      autoComplete="off"
    >
      <div className="flex flex-col gap-2">
        {/* register your input into the hook by invoking the "register" function */}
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
              validator: (rule, value, callback) => {
                console.log("### rule", rule);
                if (value === undefined) {
                  return callback("Required");
                }
                try {
                  const result = JSON.parse(value);
                  if (Array.isArray(result)) {
                    return callback();
                  }
                  callback("Invalid ABI format");
                } catch (error) {
                  callback("Invalid ABI format");
                }
              },
            },
          ]}
        >
          <Input.TextArea />
        </Form.Item>
        {/* errors will return when field validation fails  */}
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
  );
};
