export interface Contract {
  contractAddress: `0x${string}`;
  name: string;
  abiId?: string;
}

export async function createContract(params: {
  name: string;
  contractAddress: `0x${string}`;
  abiId?: string;
}) {
  const { name, contractAddress, abiId } = params;

  let contract = await getContract(contractAddress);

  if (contract) {
    throw new Error("Contract already exists");
  }

  const { contracts = {} } = await chrome.storage.local.get("contracts");

  contract = {
    contractAddress: contractAddress,
    name: name,
    abiId: abiId,
  };

  contracts[contract.contractAddress] = contract;
  // Save the updated object back to storage
  await chrome.storage.local.set({ contracts });

  return contract;
}

export async function updateContract(contract: {
  contractAddress: `0x${string}`;
  name?: string;
  abiId?: string;
}) {
  const { contractAddress } = contract;
  const { contracts = {} } = await chrome.storage.local.get("contracts");

  const contractOld = contracts[contractAddress];

  contracts[contractAddress] = {
    ...contractOld,
    ...contract,
  };
  // Save the updated object back to storage
  await chrome.storage.local.set({ contracts });

  return contract;
}

export async function getContract(
  contractAddress: `0x${string}`,
): Promise<Contract | null> {
  const { contracts = {} } = await chrome.storage.local.get({ contracts: {} });

  return contracts[contractAddress];
}

export async function linkOrCreateContractToAbi(params: {
  contractAddress: `0x${string}`;
  abiId: string;
}) {
  const { contractAddress, abiId } = params;
  const contract = await getContract(contractAddress);

  if (!contract) {
    return await createContract({
      contractAddress: contractAddress,
      name: "",
      abiId: abiId,
    });
  }

  return await updateContract({ ...contract, abiId: abiId });
}
