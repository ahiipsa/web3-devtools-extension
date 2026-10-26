export interface ABI {
  id: string;
  name: string;
  json: string;
}

export async function createABI(params: {
  name: string;
  json: string;
  contractAddress?: `0x${string}`;
}) {
  const { json } = params;
  // First, retrieve the existing ABIs
  const { abi: abis = {} } = await chrome.storage.local.get("abi");

  const abi = {
    id: Math.random().toString(36).substring(7),
    name: name,
    json: json,
  };

  abis[abi.id] = abi;
  // Save the updated object back to storage
  await chrome.storage.local.set({ abi: abis });

  // if (contractAddress) {
  //   await linkOrCreateContractToAbi({contractAddress: params.contractAddress, abiId: abi.id})
  // }

  return abi;
}

export async function getABI(abiId: string): Promise<ABI | undefined> {
  const { abi = {} } = await chrome.storage.local.get("abi");
  return abi[abiId];
}

export async function updateABI(id: string, abi: Partial<ABI>) {
  const { abi: abis = {} } = await chrome.storage.local.get("abi");

  const abiOld = abis[id];

  abis[id] = {
    id: id,
    ...abiOld,
    ...abi,
  };
  // Save the updated object back to storage
  await chrome.storage.local.set({ abi: abis });

  return abi;
}
