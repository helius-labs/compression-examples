import {
  getConcurrentMerkleTreeAccountSize,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { WrappedConnection } from "./wrappedConnection";
import {
  createBurnInstruction,
  createCreateTreeInstruction,
  createMintToCollectionV1Instruction,
  createRedeemInstruction,
  createTransferInstruction,
  createCancelRedeemInstruction,
  MetadataArgs,
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createDelegateInstruction,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
  createCreateMasterEditionV3Instruction,
  createSetCollectionSizeInstruction,
} from "@metaplex-foundation/mpl-token-metadata";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@project-serum/anchor";
import {
  bufferToArray,
  getBubblegumAuthorityPDA,
  getVoucherPDA,
} from "./helpers";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";

// Creates a new merkle tree for compression.
export const initTree = async (
  connectionWrapper: WrappedConnection,
  payerKeypair: Keypair,
  treeKeypair: Keypair,
  maxDepth: number = 14,
  maxBufferSize: number = 64
) => {
  const payer = payerKeypair.publicKey;
  const space = getConcurrentMerkleTreeAccountSize(maxDepth, maxBufferSize);
  const [treeAuthority, _bump] = await PublicKey.findProgramAddress(
    [treeKeypair.publicKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  const allocTreeIx = SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: treeKeypair.publicKey,
    lamports: await connectionWrapper.getMinimumBalanceForRentExemption(space),
    space: space,
    programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  });
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
    BUBBLEGUM_PROGRAM_ID
  );
  let tx = new Transaction().add(allocTreeIx).add(createTreeIx);
  tx.feePayer = payer;
  try {
    await sendAndConfirmTransaction(
      connectionWrapper,
      tx,
      [treeKeypair, payerKeypair],
      {
        commitment: "confirmed",
        skipPreflight: true,
      }
    );
    console.log(
      "Successfull created merkle tree for account: " + treeKeypair.publicKey
    );
  } catch (e) {
    console.error("Failed to create merkle tree: ", e);
    throw e;
  }
};

// Creates a metaplex collection NFT
export const initCollection = async (
  connectionWrapper: WrappedConnection,
  payer: Keypair
) => {
  const collectionMint = await Token.createMint(
    connectionWrapper,
    payer,
    payer.publicKey,
    payer.publicKey,
    0,
    TOKEN_PROGRAM_ID
  );
  const collectionTokenAccount = await collectionMint.createAccount(
    payer.publicKey
  );
  await collectionMint.mintTo(collectionTokenAccount, payer, [], 1);
  const [collectionMetadataAccount, _b] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata", "utf8"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      collectionMint.publicKey.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  const collectionMeatadataIX = createCreateMetadataAccountV3Instruction(
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
          name: "Nick's collection",
          symbol: "NICK",
          uri: "nicksfancyuri",
          sellerFeeBasisPoints: 100,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: false,
        collectionDetails: null,
      },
    }
  );
  const [collectionMasterEditionAccount, _b2] =
    await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata", "utf8"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        collectionMint.publicKey.toBuffer(),
        Buffer.from("edition", "utf8"),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
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
    }
  );

  const sizeCollectionIX = createSetCollectionSizeInstruction(
    {
      collectionMetadata: collectionMetadataAccount,
      collectionAuthority: payer.publicKey,
      collectionMint: collectionMint.publicKey,
    },
    {
      setCollectionSizeArgs: { size: 50 },
    }
  );

  let tx = new Transaction()
    .add(collectionMeatadataIX)
    .add(collectionMasterEditionIX)
    .add(sizeCollectionIX);
  try {
    await sendAndConfirmTransaction(connectionWrapper, tx, [payer], {
      commitment: "confirmed",
      skipPreflight: true,
    });
    console.log(
      "Successfull created NFT collection with collection address: " +
        collectionMint.publicKey.toBase58()
    );
    return {
      collectionMint,
      collectionMetadataAccount,
      collectionMasterEditionAccount,
    };
  } catch (e) {
    console.error("Failed to init collection: ", e);
    throw e;
  }
};

export const getCollectionDetailsFromMintAccount = async (
  connectionWrapper: WrappedConnection,
  collectionMintAccount: PublicKey,
  payer: Keypair
) => {
  const collectionMint = new Token(
    connectionWrapper,
    collectionMintAccount,
    TOKEN_PROGRAM_ID,
    payer
  );
  const [collectionMetadataAccount, _b] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata", "utf8"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      collectionMintAccount.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  const [collectionMasterEditionAccount, _b2] =
    await PublicKey.findProgramAddress(
      [
        Buffer.from("metadata", "utf8"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        collectionMintAccount.toBuffer(),
        Buffer.from("edition", "utf8"),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
  return {
    collectionMint,
    collectionMetadataAccount,
    collectionMasterEditionAccount,
  };
};

export const mintCompressedNft = async (
  connectionWrapper: WrappedConnection,
  nftArgs: MetadataArgs,
  ownerKeypair: Keypair,
  treeKeypair: Keypair,
  collectionMint: Token,
  collectionMetadata: PublicKey,
  collectionMasterEditionAccount: PublicKey
) => {
  const [treeAuthority, _bump] = await PublicKey.findProgramAddress(
    [treeKeypair.publicKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );
  const [bgumSigner, __] = await PublicKey.findProgramAddress(
    [Buffer.from("collection_cpi", "utf8")],
    BUBBLEGUM_PROGRAM_ID
  );
  const mintIx = createMintToCollectionV1Instruction(
    {
      merkleTree: treeKeypair.publicKey,
      treeAuthority,
      treeDelegate: ownerKeypair.publicKey,
      payer: ownerKeypair.publicKey,
      leafDelegate: ownerKeypair.publicKey,
      leafOwner: ownerKeypair.publicKey,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      collectionAuthority: ownerKeypair.publicKey,
      collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
      collectionMint: collectionMint.publicKey,
      collectionMetadata: collectionMetadata,
      editionAccount: collectionMasterEditionAccount,
      bubblegumSigner: bgumSigner,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    },
    {
      metadataArgs: Object.assign(nftArgs, {
        collection: { key: collectionMint.publicKey, verified: false },
      }),
    }
  );
  const tx = new Transaction().add(mintIx);
  tx.feePayer = ownerKeypair.publicKey;
  try {
    const sig = await sendAndConfirmTransaction(
      connectionWrapper,
      tx,
      [ownerKeypair],
      {
        commitment: "confirmed",
        skipPreflight: true,
      }
    );
    return sig;
  } catch (e) {
    console.error("Failed to mint compressed NFT", e);
    throw e;
  }
};

export const getCompressedNftId = async (
  treeKeypair: Keypair,
  leafIndex: number
) => {
  const node = new BN.BN(leafIndex);
  const [assetId] = await PublicKey.findProgramAddress(
    [
      Buffer.from("asset", "utf8"),
      treeKeypair.publicKey.toBuffer(),
      Uint8Array.from(node.toArray("le", 8)),
    ],
    BUBBLEGUM_PROGRAM_ID
  );
  return assetId;
};

export const transferAsset = async (
  connectionWrapper: WrappedConnection,
  owner: Keypair,
  newOwner: Keypair,
  assetId: string
) => {
  console.log(
    `Transfering asset ${assetId} from ${owner.publicKey.toBase58()} to ${newOwner.publicKey.toBase58()}. 
    This will depend on indexer api calls to fetch the necessary data.`
  );
  let assetProof = await connectionWrapper.getAssetProof(assetId);
  if (!assetProof?.proof || assetProof.proof.length === 0) {
    throw new Error("Proof is empty");
  }
  let proofPath = assetProof.proof.map((node: string) => ({
    pubkey: new PublicKey(node),
    isSigner: false,
    isWritable: false,
  }));
  console.log("Successfully got proof path from RPC.");

  const rpcAsset = await connectionWrapper.getAsset(assetId);
  console.log(
    "Successfully got asset from RPC. Current owner: " +
      rpcAsset.ownership.owner
  );
  if (rpcAsset.ownership.owner !== owner.publicKey.toBase58()) {
    throw new Error(
      `NFT is not owned by the expected owner. Expected ${owner.publicKey.toBase58()} but got ${
        rpcAsset.ownership.owner
      }.`
    );
  }

  const leafNonce = rpcAsset.compression.leaf_id;
  const treeAuthority = await getBubblegumAuthorityPDA(
    new PublicKey(assetProof.tree_id)
  );
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
      dataHash: bufferToArray(
        bs58.decode(rpcAsset.compression.data_hash.trim())
      ),
      creatorHash: bufferToArray(
        bs58.decode(rpcAsset.compression.creator_hash.trim())
      ),
      nonce: leafNonce,
      index: leafNonce,
    }
  );
  const tx = new Transaction().add(transferIx);
  tx.feePayer = owner.publicKey;
  try {
    const sig = await sendAndConfirmTransaction(
      connectionWrapper,
      tx,
      [owner],
      {
        commitment: "confirmed",
        skipPreflight: true,
      }
    );
    return sig;
  } catch (e) {
    console.error("Failed to transfer compressed asset", e);
    throw e;
  }
};

export const redeemAsset = async (
  connectionWrapper: WrappedConnection,
  owner: Keypair,
  assetId?: string
) => {
  let assetProof = await connectionWrapper.getAssetProof(assetId);
  const rpcAsset = await connectionWrapper.getAsset(assetId);
  const voucher = await getVoucherPDA(new PublicKey(assetProof.tree_id), 0);
  const leafNonce = rpcAsset.compression.leaf_id;
  const treeAuthority = await getBubblegumAuthorityPDA(
    new PublicKey(assetProof.tree_id)
  );
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
      dataHash: bufferToArray(
        bs58.decode(rpcAsset.compression.data_hash.trim())
      ),
      creatorHash: bufferToArray(
        bs58.decode(rpcAsset.compression.creator_hash.trim())
      ),
      nonce: leafNonce,
      index: leafNonce,
    }
  );
  const tx = new Transaction().add(redeemIx);
  tx.feePayer = owner.publicKey;
  try {
    const sig = await sendAndConfirmTransaction(
      connectionWrapper,
      tx,
      [owner],
      {
        commitment: "confirmed",
        skipPreflight: true,
      }
    );
    return sig;
  } catch (e) {
    console.error("Failed to redeem compressed asset", e);
    throw e;
  }
};

export const burnAsset = async (
  connectionWrapper: WrappedConnection,
  owner: Keypair,
  assetId?: string
) => {
  let assetProof = await connectionWrapper.getAssetProof(assetId);
  const rpcAsset = await connectionWrapper.getAsset(assetId);
  const leafNonce = rpcAsset.compression.leaf_id;
  let proofPath = assetProof.proof.map((node: string) => ({
    pubkey: new PublicKey(node),
    isSigner: false,
    isWritable: false,
}));
  const treeAuthority = await getBubblegumAuthorityPDA(
    new PublicKey(assetProof.tree_id)
  );
  const leafDelegate = rpcAsset.ownership.delegate
    ? new PublicKey(rpcAsset.ownership.delegate)
    : new PublicKey(rpcAsset.ownership.owner);
  const burnIx = createBurnInstruction(
    {
      treeAuthority,
      leafOwner: new PublicKey(rpcAsset.ownership.owner),
      leafDelegate,
      merkleTree: new PublicKey(assetProof.tree_id),
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      anchorRemainingAccounts: proofPath,

    },
    {
      root: bufferToArray(bs58.decode(assetProof.root)),
      dataHash: bufferToArray(
        bs58.decode(rpcAsset.compression.data_hash.trim())
      ),
      creatorHash: bufferToArray(
        bs58.decode(rpcAsset.compression.creator_hash.trim())
      ),
      nonce: leafNonce,
      index: leafNonce,
    }
  );
  const tx = new Transaction().add(burnIx);
  tx.feePayer = owner.publicKey;
  try {
    const sig = await sendAndConfirmTransaction(
      connectionWrapper,
      tx,
      [owner],
      {
        commitment: "confirmed",
        skipPreflight: true,
      }
    );
    return sig;
  } catch (e) {
    console.error("Failed to burn compressed asset", e);
    throw e;
  }
};

export const cancelRedeemAsset = async (
  connectionWrapper: WrappedConnection,
  owner: Keypair,
  assetId?: string
) => {
  let assetProof = await connectionWrapper.getAssetProof(assetId);
  const rpcAsset = await connectionWrapper.getAsset(assetId);
  const voucher = await getVoucherPDA(new PublicKey(assetProof.tree_id), 0);
  const treeAuthority = await getBubblegumAuthorityPDA(
    new PublicKey(assetProof.tree_id)
  );
  const cancelRedeemIx = createCancelRedeemInstruction(
    {
      treeAuthority,
      leafOwner: new PublicKey(rpcAsset.ownership.owner),
      merkleTree: new PublicKey(assetProof.tree_id),
      voucher,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      root: bufferToArray(bs58.decode(assetProof.root)),
    }
  );
  const tx = new Transaction().add(cancelRedeemIx);
  tx.feePayer = owner.publicKey;
  try {
    const sig = await sendAndConfirmTransaction(
      connectionWrapper,
      tx,
      [owner],
      {
        commitment: "confirmed",
        skipPreflight: true,
      }
    );
    return sig;
  } catch (e) {
    console.error("Failed to cancel redeem compressed asset", e);
    throw e;
  }
};

export const delegateAsset = async (
  connectionWrapper: WrappedConnection,
  owner: Keypair,
  assetId?: string
) => {
  let assetProof = await connectionWrapper.getAssetProof(assetId);
  const rpcAsset = await connectionWrapper.getAsset(assetId);
  const leafNonce = rpcAsset.compression.leaf_id;
  const treeAuthority = await getBubblegumAuthorityPDA(
    new PublicKey(assetProof.tree_id)
  );
  const previousLeafDelegate = rpcAsset.ownership.delegate
    ? new PublicKey(rpcAsset.ownership.delegate)
    : new PublicKey(rpcAsset.ownership.owner);
  const newLeafDelegate = previousLeafDelegate;
  const delegateIx = createDelegateInstruction(
    {
      treeAuthority,
      leafOwner: new PublicKey(rpcAsset.ownership.owner),
      previousLeafDelegate,
      newLeafDelegate,
      merkleTree: new PublicKey(assetProof.tree_id),
      logWrapper: SPL_NOOP_PROGRAM_ID,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    },
    {
      root: bufferToArray(bs58.decode(assetProof.root)),
      dataHash: bufferToArray(
        bs58.decode(rpcAsset.compression.data_hash.trim())
      ),
      creatorHash: bufferToArray(
        bs58.decode(rpcAsset.compression.creator_hash.trim())
      ),
      nonce: leafNonce,
      index: leafNonce,
    }
  );
  const tx = new Transaction().add(delegateIx);
  tx.feePayer = owner.publicKey;
  try {
    const sig = await sendAndConfirmTransaction(
      connectionWrapper,
      tx,
      [owner],
      {
        commitment: "confirmed",
        skipPreflight: true,
      }
    );
    return sig;
  } catch (e) {
    console.error("Failed to delegate compressed asset", e);
    throw e;
  }
};
