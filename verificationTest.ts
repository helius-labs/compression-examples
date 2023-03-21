import {
  TokenProgramVersion,
  TokenStandard,
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  MintToCollectionV1InstructionAccounts,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  ConcurrentMerkleTreeAccount,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '@solana/spl-account-compression';
import { AddressLookupTableProgram, Keypair, PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import base58 from 'bs58';
import {
  getCompressedNftId,
  initCollection,
  initTree,
  mintCompressedNft,
  createMintCompressedNftIxn,
  transferAsset,
  sendTransactionV0,
} from './utils';

import { PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import { WrappedConnection } from './wrappedConnection';
import { web3 } from '@project-serum/anchor';

type Configuration = {
  ownerWallet: Keypair;
  treeWallet: Keypair;
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

  // Fixed wallet to manage the merkle tree used to store the collection.
  const treeWallet = Keypair.generate();
  return {
    ownerWallet,
    connectionWrapper,
    treeWallet,
  };
};
const createALT = async (connection: WrappedConnection, payer: Keypair, pubKeys: PublicKey[]) => {
  // create lookip table instruction
  const conn = new web3.Connection(web3.clusterApiUrl('devnet'));
  const slot = await conn.getSlot();
  let [ix, lookupTablePubkey] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot: slot,
  });
  await sendTransactionV0(connection, [ix], payer);

  ix = AddressLookupTableProgram.extendLookupTable({
    addresses: pubKeys,
    authority: payer.publicKey,
    lookupTable: lookupTablePubkey,
    payer: payer.publicKey,
  });
  await sendTransactionV0(connection, [ix], payer);
  return lookupTablePubkey;
};

const NUM_COLLECTIONS = 3;
const NUM_NFTS_PER_COLLECTION = 100;
const NUM_IXN_PER_TXN = 5;
const verificationTest = async () => {
  const { ownerWallet, connectionWrapper, treeWallet } = getConfiguration();

  console.log('Tree wallet: ' + treeWallet.publicKey);
  console.log('Creating merkle tree.');
  // Creates tree account, and inits gummyroll merkle tree
  await initTree(connectionWrapper, ownerWallet, treeWallet);

  let ixnBatch = [];
  let lookupTableKey = undefined;
  let collectionMints = [];
  for (let i = 0; i < NUM_COLLECTIONS; i++) {
    const { collectionMint, collectionMetadataAccount, collectionMasterEditionAccount } = await initCollection(
      i,
      connectionWrapper,
      ownerWallet,
    );
    console.log(`\n===Collection ${i} Details===`);
    console.log('Mint account: ' + collectionMint.publicKey.toBase58());
    console.log('Metadata account: ' + collectionMetadataAccount.toBase58());
    console.log('Master edition account: ' + collectionMasterEditionAccount.toBase58());
    console.log('\n');
    collectionMints.push(collectionMint);

    // retrieve tree auth
    const [treeAuthority, _bump] = await PublicKey.findProgramAddress(
      [treeWallet.publicKey.toBuffer()],
      BUBBLEGUM_PROGRAM_ID,
    );
    // retrieve fixed bubblegum signer
    const [bgumSigner, __] = await PublicKey.findProgramAddress(
      [Buffer.from('collection_cpi', 'utf8')],
      BUBBLEGUM_PROGRAM_ID,
    );
    const createMintAccounts: MintToCollectionV1InstructionAccounts = {
      merkleTree: treeWallet.publicKey,
      treeAuthority,
      treeDelegate: ownerWallet.publicKey,
      payer: ownerWallet.publicKey,
      leafDelegate: ownerWallet.publicKey,
      leafOwner: ownerWallet.publicKey,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      collectionAuthority: ownerWallet.publicKey,
      collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
      collectionMint: collectionMint.publicKey,
      collectionMetadata: collectionMetadataAccount,
      editionAccount: collectionMasterEditionAccount,
      bubblegumSigner: bgumSigner,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    };
    const pubKeys = [
      treeWallet.publicKey,
      treeAuthority,
      ownerWallet.publicKey,
      SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      SPL_NOOP_PROGRAM_ID,
      BUBBLEGUM_PROGRAM_ID,
      collectionMint.publicKey,
      collectionMetadataAccount,
      collectionMasterEditionAccount,
      bgumSigner,
      TOKEN_METADATA_PROGRAM_ID,
      SystemProgram.programId,
    ].map((k) => new PublicKey(k));
    console.log('Creating lookup table');
    lookupTableKey = await createALT(connectionWrapper, ownerWallet, pubKeys);

    for (let j = 0; j < NUM_NFTS_PER_COLLECTION; j++) {
      const nftArgs = {
        name: `Compression Test ${i}:${j}`,
        symbol: `COMP ${i}:${j}`,
        uri: `uri ${i}:${j}`,
        creators: [],
        editionNonce: 253,
        tokenProgramVersion: TokenProgramVersion.Original,
        tokenStandard: TokenStandard.NonFungible,
        uses: null,
        collection: { key: collectionMint.publicKey, verified: false },
        primarySaleHappened: false,
        sellerFeeBasisPoints: 0,
        isMutable: false,
      };

      const ixn: TransactionInstruction = await createMintCompressedNftIxn(nftArgs, createMintAccounts);
      ixnBatch.push(ixn);
      if (ixnBatch.length == NUM_IXN_PER_TXN) {
        const sig = await mintCompressedNft(connectionWrapper, ixnBatch, ownerWallet, lookupTableKey);
        console.log('Minted compressed nft with txn: ' + sig);
        ixnBatch = [];
      }
    }
  }
  if (ixnBatch.length > 0 && lookupTableKey) {
    const sig = await mintCompressedNft(connectionWrapper, ixnBatch, ownerWallet, lookupTableKey);
    console.log('Minted compressed nft with txn: ' + sig);
    ixnBatch = [];
  }

  // Verify the NFT was minted with correct metadata.

  // wait for 20 seconds for account to index
  await new Promise((f) => setTimeout(f, 20000));

  const indexed = new Map();

  for (let i = 0; i < NUM_COLLECTIONS * NUM_NFTS_PER_COLLECTION; i++) {
    const assetId = await getCompressedNftId(treeWallet, i);
    const asset = await connectionWrapper.getAsset(assetId);
    const jsonUri = asset.content.json_uri;
    const name = asset.content.metadata.name;
    const symbol = asset.content.metadata.symbol;
    let collection = '';
    asset.grouping.forEach((group: any) => {
      if (group.group_key == 'collection') {
        collection = group.group_value;
      }
    });
    const id = symbol.split(' ')[1];
    indexed.set(id, { jsonUri, name, symbol, collection });
  }

  // verification
  if (indexed.size == NUM_COLLECTIONS * NUM_NFTS_PER_COLLECTION) {
    console.log('All NFTs indexed');
  } else {
    console.log(`All NFTs NOT indexed, expected ${NUM_COLLECTIONS * NUM_NFTS_PER_COLLECTION} got ${indexed.size}`);
  }
  for (let i = 0; i < NUM_COLLECTIONS; i++) {
    const collectionMint = collectionMints[i];
    for (let j = 0; j < NUM_NFTS_PER_COLLECTION; j++) {
      const target = {
        name: `Compression Test ${i}:${j}`,
        symbol: `COMP ${i}:${j}`,
        jsonUri: `uri ${i}:${j}`,
        collection: collectionMint.publicKey.toBase58(),
      };
      const id = `${i}:${j}`;
      if (!indexed.has(id)) {
        console.log(`NFT ${id} not indexed`);
        continue;
      }
      const asset = indexed.get(id);
      if (!shallowEqual(asset, target)) {
        console.log(`NFT ${id} not indexed correctly`);
        console.log('Got: ' + JSON.stringify(indexed.get(id), null, 2));
        console.log('Expected: ' + JSON.stringify(target, null, 2));
      }
    }
  }
};

function shallowEqual(object1: any, object2: any) {
  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (let key of keys1) {
    if (object1[key] !== object2[key]) {
      return false;
    }
  }
  return true;
}
verificationTest();
