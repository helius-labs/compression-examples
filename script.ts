import { Keypair, PublicKey } from '@solana/web3.js';
import { WrappedConnection } from './wrappedConnection';
import base58 from 'bs58';
import { BN } from '@project-serum/anchor';

import { PROGRAM_ID } from '@metaplex-foundation/mpl-bubblegum';

type Configuration = {
  ownerWallet: Keypair;
  connectionWrapper: WrappedConnection;
};
const getConfiguration = (): Configuration => {
  const apiKey = process.env['API_KEY'];
  if (!apiKey) {
    throw new Error('Api key must be provided via API_KEY env var');
  }

  const secretKey = process.env['SECRET_KEY'];
  if (!secretKey) {
    throw new Error('Wallet secret key must be provided via SECRET_KEY env var');
  }
  let decodedSecretKey;
  try {
    decodedSecretKey = base58.decode(secretKey);
  } catch {
    throw new Error('Invalid secret key provided. Must be a base 58 encoded string.');
  }

  const ownerWallet = Keypair.fromSecretKey(decodedSecretKey);
  console.log('Owner wallet: ' + ownerWallet.publicKey);

  const connectionString = `https://rpc-devnet.helius.xyz?api-key=${apiKey}`;
  const connectionWrapper = new WrappedConnection(ownerWallet, connectionString);

  return {
    ownerWallet,
    connectionWrapper,
  };
};
export const getCompressedNftId = async (treeKey: PublicKey, leafIndex: number) => {
  const node = new BN.BN(leafIndex);
  const [assetId] = await PublicKey.findProgramAddressSync(
    [Buffer.from('asset', 'utf8'), treeKey.toBuffer(), Uint8Array.from(node.toArray('le', 8))],
    PROGRAM_ID,
  );
  return assetId;
};
const printEntireTree = async (connection: WrappedConnection, treeId: string) => {
  console.log('Printing entire tree');
  let i = 5000;
  const assetId = await getCompressedNftId(new PublicKey(treeId), i);
  const asset = await connection.getAsset(assetId);
  if (!asset) {
    console.log('Asset not found');
  } else {
    console.log('Asset  found');
  }
};

const printIndexOfTree = async (connection: WrappedConnection, treeId: string, index: number) => {
  console.log(`Printing index ${index} of tree ${treeId}`);
  const assetId = await getCompressedNftId(new PublicKey(treeId), index);
  console.log(`Got assetId ${assetId}`);
  const asset = await connection.getAsset(assetId);
  if (!asset) {
    console.log('Asset not found');
  } else {
    console.log(JSON.stringify(asset, null, 2));
  }
};

const main = async () => {
  const { connectionWrapper } = getConfiguration();
  // await printEntireTree(connectionWrapper, 'APBGd5QtSg8PWxGK6pqzRpffBXknpHhMET1bzafLkysx');
  await printIndexOfTree(connectionWrapper, 'APBGd5QtSg8PWxGK6pqzRpffBXknpHhMET1bzafLkysx', 3050);
};
main();
