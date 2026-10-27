import { sendRpcRequest } from "./endpointRpc.ts";
import { parseNonZeroAddress } from "./address.ts";

// bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
// bytes32(uint256(keccak256("eip1967.proxy.beacon")) - 1)
const BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
// implementation()
const IMPLEMENTATION_SELECTOR = "0x5c60da1b";

// The address in the low 20 bytes of a word, unless it is zero; some nodes
// drop the leading zeros
const wordToAddress = (word: unknown) =>
  typeof word === "string" && /^0x[0-9a-f]{1,64}$/i.test(word)
    ? parseNonZeroAddress(`0x${word.slice(2).padStart(64, "0").slice(24)}`)
    : undefined;

// The implementation of an EIP-1967 proxy, read on the Endpoint: the
// implementation slot, else implementation() on the beacon in the beacon
// slot. Undefined for an address that is neither. Throws an Error whose
// message is fit to show the user
export async function readEip1967Implementation(
  endpoint: string,
  address: `0x${string}`,
  fetchFn: typeof fetch = fetch,
): Promise<`0x${string}` | undefined> {
  const readSlot = async (slot: string) =>
    wordToAddress(
      await sendRpcRequest(
        endpoint,
        "eth_getStorageAt",
        [address, slot, "latest"],
        fetchFn,
      ),
    );

  const implementation = await readSlot(IMPLEMENTATION_SLOT);
  if (implementation) {
    return implementation;
  }
  const beacon = await readSlot(BEACON_SLOT);
  if (!beacon) {
    return undefined;
  }
  return wordToAddress(
    await sendRpcRequest(
      endpoint,
      "eth_call",
      [{ to: beacon, data: IMPLEMENTATION_SELECTOR }, "latest"],
      fetchFn,
    ),
  );
}
