console.log(
  "### import.meta.env.VITE_TEST_RPC_REQUESTS",
  import.meta.env.VITE_TEST_RPC_REQUESTS,
);
export const config = {
  addDummyRPCRequests: import.meta.env.VITE_TEST_RPC_REQUESTS === "1",
};
