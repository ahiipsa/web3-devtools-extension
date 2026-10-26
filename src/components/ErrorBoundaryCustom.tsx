import { Button, Result, Typography } from "antd";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";

const { Paragraph, Text } = Typography;

export const ErrorBoundaryCustom = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <ErrorBoundary fallbackRender={fallbackRender}>{children}</ErrorBoundary>
  );
};

const fallbackRender = ({ error }: FallbackProps) => {
  return (
    <Result
      status="error"
      title="Unexpected error"
      subTitle="Something went wrong."
      extra={[
        <Button
          type="primary"
          key="console"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>,
      ]}
    >
      <div className="desc text-center">
        <Paragraph>
          <Text strong>{error.message}</Text>
        </Paragraph>
      </div>
    </Result>
  );
};
