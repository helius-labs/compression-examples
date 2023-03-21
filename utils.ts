import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from '@solana/spl-account-compression';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { WrappedConnection } from './wrappedConnection';
import {
  createCreateTreeInstruction,
  createMintToCollectionV1Instruction,
  createRedeemInstruction,
  createTransferInstruction,
  MetadataArgs,
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  MintToCollectionV1InstructionAccounts,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
  createCreateMasterEditionV3Instruction,
  createSetCollectionSizeInstruction,
} from '@metaplex-foundation/mpl-token-metadata';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from '@project-serum/anchor';
import { bufferToArray, getBubblegumAuthorityPDA, getVoucherPDA } from './helpers';
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes';

// Creates a new merkle tree for compression.
export const initTree = async (
  connectionWrapper: WrappedConnection,
  payerKeypair: Keypair,
  treeKeypair: Keypair,
  maxDepth: number = 14,
  maxBufferSize: number = 64,
) => {
  const payer = payerKeypair.publicKey;
  // get space for merkle tree
  const space = getConcurrentMerkleTreeAccountSize(maxDepth, maxBufferSize);
  // pda for merkle tree
  const [treeAuthority, _bump] = await PublicKey.findProgramAddress(
    [treeKeypair.publicKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID,
  );
  // create tree account with enough rent and space for the buffer
  const allocTreeIx = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: treeKeypair.publicKey,
    lamports: await connectionWrapper.getMinimumBalanceForRentExemption(space),
    space: space,
    programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  });
  // create a merkle tree via CPI to Gummyroll
  const createTreeIx = createCreateTreeInstruction(
    {
      merkleTree: treeKeypair.publicKey,
      treeAuthority,
      treeCreator: payer,
      payer,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      maxBufferSize,
      maxDepth,
      public: false,
    },
    BUBBLEGUM_PROGRAM_ID,
  );
  // execute txn
  let tx = new Transaction().add(allocTreeIx).add(createTreeIx);
  tx.feePayer = payer;
  try {
    await sendAndConfirmTransaction(connectionWrapper, tx, [treeKeypair, payerKeypair], {
      commitment: 'confirmed',
      skipPreflight: true,
    });
    console.log('Successfull created merkle tree for account: ' + treeKeypair.publicKey);
  } catch (e) {
    console.error('Failed to create merkle tree: ', e);
    throw e;
  }
};

// Creates a metaplex collection NFT
export const initCollection = async (collectionId: number, connectionWrapper: WrappedConnection, payer: Keypair) => {
  const collectionMint = await Token.createMint(
    connectionWrapper,
    payer,
    payer.publicKey,
    payer.publicKey,
    0,
    TOKEN_PROGRAM_ID,
  );
  // collection mint account
  const collectionTokenAccount = await collectionMint.createAccount(payer.publicKey);
  await collectionMint.mintTo(collectionTokenAccount, payer, [], 1);
  // pda for collection metadata account
  const [collectionMetadataAccount, _b] = await PublicKey.findProgramAddress(
    [Buffer.from('metadata', 'utf8'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), collectionMint.publicKey.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  );
  // create ixn
  const collectionMetadataIX = createCreateMetadataAccountV3Instruction(
    {
      metadata: collectionMetadataAccount,
      mint: collectionMint.publicKey,
      mintAuthority: payer.publicKey,
      payer: payer.publicKey,
      updateAuthority: payer.publicKey,
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name: 'collection ' + collectionId,
          symbol: `COLL${collectionId}`,
          uri: `uriCollection${collectionId}`,
          sellerFeeBasisPoints: 100,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: false,
        collectionDetails: null,
      },
    },
  );
  // get pda for collection master edition account
  const [collectionMasterEditionAccount, _b2] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata', 'utf8'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      collectionMint.publicKey.toBuffer(),
      Buffer.from('edition', 'utf8'),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );
  // create master edition ixn
  const collectionMasterEditionIX = createCreateMasterEditionV3Instruction(
    {
      edition: collectionMasterEditionAccount,
      mint: collectionMint.publicKey,
      mintAuthority: payer.publicKey,
      payer: payer.publicKey,
      updateAuthority: payer.publicKey,
      metadata: collectionMetadataAccount,
    },
    {
      createMasterEditionArgs: {
        maxSupply: 0,
      },
    },
  );

  // set collection size
  const sizeCollectionIX = createSetCollectionSizeInstruction(
    {
      collectionMetadata: collectionMetadataAccount,
      collectionAuthority: payer.publicKey,
      collectionMint: collectionMint.publicKey,
    },
    {
      setCollectionSizeArgs: { size: 50 },
    },
  );

  // create collection metadata, master edition, and set size
  let tx = new Transaction().add(collectionMetadataIX).add(collectionMasterEditionIX).add(sizeCollectionIX);
  try {
    await sendAndConfirmTransaction(connectionWrapper, tx, [payer], {
      commitment: 'confirmed',
      skipPreflight: true,
      maxRetries: 5,
    });
    console.log(
      `Successfully created NFT collection ${collectionId} with collection address: ` +
        collectionMint.publicKey.toBase58(),
    );
    return {
      collectionMint,
      collectionMetadataAccount,
      collectionMasterEditionAccount,
    };
  } catch (e) {
    console.error('Failed to init collection: ', e);
    throw e;
  }
};

export const getCollectionDetailsFromMintAccount = async (
  connectionWrapper: WrappedConnection,
  collectionMintAccount: PublicKey,
  payer: Keypair,
) => {
  const collectionMint = new Token(connectionWrapper, collectionMintAccount, TOKEN_PROGRAM_ID, payer);
  const [collectionMetadataAccount, _b] = await PublicKey.findProgramAddress(
    [Buffer.from('metadata', 'utf8'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), collectionMintAccount.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  );
  const [collectionMasterEditionAccount, _b2] = await PublicKey.findProgramAddress(
    [
      Buffer.from('metadata', 'utf8'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      collectionMintAccount.toBuffer(),
      Buffer.from('edition', 'utf8'),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );
  return {
    collectionMint,
    collectionMetadataAccount,
    collectionMasterEditionAccount,
  };
};

export const createMintCompressedNftIxn = async (
  nftArgs: MetadataArgs,
  createMintAccounts: MintToCollectionV1InstructionAccounts,
): Promise<TransactionInstruction> => {
  const mintIx = createMintToCollectionV1Instruction(createMintAccounts, {
    metadataArgs: nftArgs,
  });
  return mintIx;
};

export const mintCompressedNft = async (
  connectionWrapper: WrappedConnection,
  mintIxs: TransactionInstruction[],
  payer: Keypair,
  lookupTable: PublicKey,
) => {
  try {
    const sig = await sendTransactionV0WithLookupTable(connectionWrapper, mintIxs, [payer], payer, lookupTable);
    return sig;
  } catch (e) {
    console.error('Failed to mint compressed NFT', e);
    throw e;
  }
};

export const getCompressedNftId = async (treeKeypair: Keypair, leafIndex: number) => {
  const node = new BN.BN(leafIndex);
  const [assetId] = await PublicKey.findProgramAddress(
    [Buffer.from('asset', 'utf8'), treeKeypair.publicKey.toBuffer(), Uint8Array.from(node.toArray('le', 8))],
    BUBBLEGUM_PROGRAM_ID,
  );
  return assetId;
};

export const transferAsset = async (
  connectionWrapper: WrappedConnection,
  owner: Keypair,
  newOwner: Keypair,
  assetId: string,
) => {
  console.log(
    `Transfering asset ${assetId} from ${owner.publicKey.toBase58()} to ${newOwner.publicKey.toBase58()}. 
    This will depend on indexer api calls to fetch the necessary data.`,
  );
  let assetProof = await connectionWrapper.getAssetProof(assetId);
  if (!assetProof?.proof || assetProof.proof.length === 0) {
    throw new Error('Proof is empty');
  }
  let proofPath = assetProof.proof.map((node: string) => ({
    pubkey: new PublicKey(node),
    isSigner: false,
    isWritable: false,
  }));
  console.log('Successfully got proof path from RPC.');

  const rpcAsset = await connectionWrapper.getAsset(assetId);
  console.log('Successfully got asset from RPC. Current owner: ' + rpcAsset.ownership.owner);
  if (rpcAsset.ownership.owner !== owner.publicKey.toBase58()) {
    throw new Error(
      `NFT is not owned by the expected owner. Expected ${owner.publicKey.toBase58()} but got ${
        rpcAsset.ownership.owner
      }.`,
    );
  }

  const leafNonce = rpcAsset.compression.leaf_id;
  const treeAuthority = await getBubblegumAuthorityPDA(new PublicKey(assetProof.tree_id));
  const leafDelegate = rpcAsset.ownership.delegate
    ? new PublicKey(rpcAsset.ownership.delegate)
    : new PublicKey(rpcAsset.ownership.owner);
  let transferIx = createTransferInstruction(
    {
      treeAuthority,
      leafOwner: new PublicKey(rpcAsset.ownership.owner),
      leafDelegate: leafDelegate,
      newLeafOwner: newOwner.publicKey,
      merkleTree: new PublicKey(assetProof.tree_id),
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      anchorRemainingAccounts: proofPath,
    },
    {
      root: bufferToArray(bs58.decode(assetProof.root)),
      dataHash: bufferToArray(bs58.decode(rpcAsset.compression.data_hash.trim())),
      creatorHash: bufferToArray(bs58.decode(rpcAsset.compression.creator_hash.trim())),
      nonce: leafNonce,
      index: leafNonce,
    },
  );
  const tx = new Transaction().add(transferIx);
  tx.feePayer = owner.publicKey;
  try {
    const sig = await sendAndConfirmTransaction(connectionWrapper, tx, [owner], {
      commitment: 'confirmed',
      skipPreflight: true,
    });
    return sig;
  } catch (e) {
    console.error('Failed to transfer compressed asset', e);
    throw e;
  }
};

export const redeemAsset = async (connectionWrapper: WrappedConnection, owner: Keypair, assetId?: string) => {
  let assetProof = await connectionWrapper.getAssetProof(assetId);
  const rpcAsset = await connectionWrapper.getAsset(assetId);
  const voucher = await getVoucherPDA(new PublicKey(assetProof.tree_id), 0);
  const leafNonce = rpcAsset.compression.leaf_id;
  const treeAuthority = await getBubblegumAuthorityPDA(new PublicKey(assetProof.tree_id));
  const leafDelegate = rpcAsset.ownership.delegate
    ? new PublicKey(rpcAsset.ownership.delegate)
    : new PublicKey(rpcAsset.ownership.owner);
  const redeemIx = createRedeemInstruction(
    {
      treeAuthority,
      leafOwner: new PublicKey(rpcAsset.ownership.owner),
      leafDelegate,
      merkleTree: new PublicKey(assetProof.tree_id),
      voucher,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      root: bufferToArray(bs58.decode(assetProof.root)),
      dataHash: bufferToArray(bs58.decode(rpcAsset.compression.data_hash.trim())),
      creatorHash: bufferToArray(bs58.decode(rpcAsset.compression.creator_hash.trim())),
      nonce: leafNonce,
      index: leafNonce,
    },
  );
  const tx = new Transaction().add(redeemIx);
  tx.feePayer = owner.publicKey;
  try {
    const sig = await sendAndConfirmTransaction(connectionWrapper, tx, [owner], {
      commitment: 'confirmed',
      skipPreflight: true,
    });
    return sig;
  } catch (e) {
    console.error('Failed to redeem compressed asset', e);
    throw e;
  }
};

export async function sendTransactionV0WithLookupTable(
  connection: WrappedConnection,
  instructions: TransactionInstruction[],
  signatures: Keypair[],
  payer: Keypair,
  lookupTablePubkey: PublicKey,
): Promise<string> {
  const lookupTableAccount = await connection.getAddressLookupTable(lookupTablePubkey).then((res) => res.value);
  if (!lookupTableAccount) {
    throw new Error('lookup table not found');
  }

  let blockhash = await connection.getLatestBlockhash();

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions,
  }).compileToV0Message([lookupTableAccount]);

  const tx = new VersionedTransaction(messageV0);
  tx.sign(signatures);
  const sx = await connection.sendTransaction(tx);
  const confirm = await connection.confirmTransaction({
    blockhash: blockhash.blockhash,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
    signature: sx,
  });

  console.log(`** -- Signature: ${sx}`);
  return sx;
}
export async function sendTransactionV0(
  connection: WrappedConnection,
  instructions: TransactionInstruction[],
  payer: Keypair,
): Promise<void> {
  let blockhash = await connection.getLatestBlockhash();

  const messageV0 = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(messageV0);
  tx.sign([payer]);
  const sx = await connection.sendTransaction(tx);
  const confirm = await connection.confirmTransaction(
    {
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
      signature: sx,
    },
    'finalized',
  );
  console.log(`** -- Signature: ${sx}`);
}
