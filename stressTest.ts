import {
  TokenProgramVersion,
  TokenStandard,
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  MintToCollectionV1InstructionAccounts,
  createCreateTreeInstruction,
} from '@metaplex-foundation/mpl-bubblegum';
import {
  ConcurrentMerkleTreeAccount,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize,
} from '@solana/spl-account-compression';
import {
  AddressLookupTableProgram,
  Keypair,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';
import base58 from 'bs58';
import fs from 'fs';
import {
  PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
  createCreateMasterEditionV3Instruction,
  createCreateMetadataAccountV3Instruction,
  createSetCollectionSizeInstruction,
} from '@metaplex-foundation/mpl-token-metadata';
import { WrappedConnection } from './wrappedConnection';
import { web3 } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import { createMintCompressedNftIxn, mintCompressedNft } from './utils';
import { v4 as uuidv4 } from 'uuid';

type Configuration = {
  payerWallet: Keypair;
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

  // const connectionString = `https://rpc-devnet.helius.xyz?api-key=${apiKey}`;
  const connectionString = `https://rpc.helius.xyz?api-key=${apiKey}`;
  const connectionWrapper = new WrappedConnection(ownerWallet, connectionString);

  // Fixed wallet to manage the merkle tree used to store the collection.
  const treeWallet = Keypair.generate();
  return {
    payerWallet: ownerWallet,
    connectionWrapper,
    treeWallet,
  };
};

const shallowEqual = (object1?: any, object2?: any) => {
  if (!(object1 && object2)) {
    return false;
  }
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
};

type CollectionConfig = {
  collectionMint: PublicKey;
  collectionMetadataAccount: PublicKey;
  collectionMasterEditionAccount: PublicKey;
};
// Creates a metaplex collection NFT
const initCollection = async (
  collectionId: number,
  connectionWrapper: WrappedConnection,
  payer: Keypair,
): Promise<CollectionConfig> => {
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
          name: `Collection${collectionId}`,
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
      maxRetries: 5,
    });
    console.log(
      `Successfully created NFT collection ${collectionId} with collection address: ` +
        collectionMint.publicKey.toBase58(),
    );
    return {
      collectionMint: collectionMint.publicKey,
      collectionMetadataAccount,
      collectionMasterEditionAccount,
    };
  } catch (e) {
    console.error('Failed to init collection: ', e);
    throw e;
  }
};

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
  const [treeAuthority, _bump] = await PublicKey.findProgramAddressSync(
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
    console.log('Successfully created merkle tree for account: ' + treeKeypair.publicKey);
  } catch (e) {
    console.error('Failed to create merkle tree: ', e);
    throw e;
  }
};

const sendMintTxn = async (
  nftId: string,
  nonce: number,
  count: number,
  collection: CollectionConfig,
  leafOwner: PublicKey,
  createMintAccounts: MintToCollectionV1InstructionAccounts,
  connectionWrapper: WrappedConnection,
  payerWallet: Keypair,
): Promise<MintEvent> => {
  const numId = parseInt(nftId);
  // 15k yoots
  const yootsUrl = `https://metadata.y00ts.com/y/${numId % 15000}.json`;
  const owner = leafOwner.toBase58();
  const nftArgs = {
    name: `Compressed ${nftId}`,
    symbol: `COMP ${nftId}`,
    uri: yootsUrl,
    creators: [],
    editionNonce: nonce,
    tokenProgramVersion: TokenProgramVersion.Original,
    tokenStandard: TokenStandard.NonFungible,
    uses: null,
    collection: { key: collection.collectionMint, verified: false },
    primarySaleHappened: false,
    sellerFeeBasisPoints: count,
    isMutable: false,
  };
  const ixn: TransactionInstruction = createMintCompressedNftIxn(nftArgs, {
    ...createMintAccounts,
    leafOwner,
  });
  let tx = new Transaction().add(ixn);
  let sig = '';
  try {
    sig = await sendAndConfirmTransaction(connectionWrapper, tx, [payerWallet], {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
      skipPreflight: false,
      maxRetries: 5,
    });
  } catch (e) {
    console.error('Failed to mint NFT: ', e);
  }
  // console.log(`Successfully minted NFT ${nftId} with signature: ${sig}, owner:${owner}`);
  const nft: Nft = {
    nftId,
    owner,
    name: nftArgs.name,
    symbol: nftArgs.symbol,
    jsonUri: nftArgs.uri,
    collection: collection.collectionMint.toBase58(),
    editionNonce: nftArgs.editionNonce,
    sellerFeeBasisPoints: nftArgs.sellerFeeBasisPoints,
  };
  return { signature: sig, nft };
};

const mintCompressedNfts = async (
  connectionWrapper: WrappedConnection,
  payerWallet: Keypair,
  treePubkey: PublicKey,
  startId: number,
  collectionId: number,
  collectionMints?: CollectionConfig[],
): Promise<Map<string, MintEvent[]>> => {
  if (!collectionMints) {
    collectionMints = [await initCollection(collectionId, connectionWrapper, payerWallet)];
  }
  let count = startId;
  let mintEventMap = new Map<string, MintEvent[]>();

  let leafOwner = Keypair.generate().publicKey;
  let ownerMinted = 0;
  let promises: any = [];
  for (let collection of collectionMints) {
    // retrieve tree auth
    const [treeAuthority, _bump] = await PublicKey.findProgramAddressSync(
      [treePubkey.toBuffer()],
      BUBBLEGUM_PROGRAM_ID,
    );
    // retrieve fixed bubblegum signer
    const [bgumSigner, __] = await PublicKey.findProgramAddressSync(
      [Buffer.from('collection_cpi', 'utf8')],
      BUBBLEGUM_PROGRAM_ID,
    );
    const createMintAccounts: MintToCollectionV1InstructionAccounts = {
      // dynamic variables
      leafOwner: payerWallet.publicKey,
      ////
      merkleTree: treePubkey,
      treeAuthority,
      treeDelegate: payerWallet.publicKey,
      payer: payerWallet.publicKey,
      leafDelegate: payerWallet.publicKey,
      compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      logWrapper: SPL_NOOP_PROGRAM_ID,
      collectionAuthority: payerWallet.publicKey,
      collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
      collectionMint: collection.collectionMint,
      collectionMetadata: collection.collectionMetadataAccount,
      editionAccount: collection.collectionMasterEditionAccount,
      bubblegumSigner: bgumSigner,
      tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
    };

    for (let j = 0; j < NUM_NFTS_PER_COLLECTION; j++) {
      const nftId = (++count).toString();
      const nonce = count % 256;
      promises.push(
        sendMintTxn(nftId, nonce, count, collection, leafOwner, createMintAccounts, connectionWrapper, payerWallet),
      );
      ownerMinted++;
      if (ownerMinted == NUM_NFTS_PER_OWNER) {
        leafOwner = Keypair.generate().publicKey;
        ownerMinted = 0;
      }
    }
    const responses: MintEvent[] = await Promise.all(promises);
    responses.map((response) => {
      const owner = response.nft.owner;
      const nftEvents = mintEventMap.get(owner) || [];
      nftEvents.push(response);
      mintEventMap.set(owner, nftEvents);
    });
  }
  return mintEventMap;
};

// returns nftId to NFT map
const buildNftTypeMap = (assets: any[]): Map<string, AssetResponse> => {
  const result = new Map<string, AssetResponse>();
  assets.map((asset) => {
    const jsonUri = asset.content.json_uri;
    const name = asset.content.metadata.name;
    const symbol = asset.content.metadata.symbol;
    const editionNonce = asset.supply.edition_nonce;
    const sellerFeeBasisPoints = asset.royalty.basis_points;
    let collection = '';
    asset.grouping.forEach((group: any) => {
      if (group.group_key == 'collection') {
        collection = group.group_value;
      }
    });

    const nftId = symbol.split(' ')[1];
    const owner = asset.ownership.owner;
    const leafId = asset.compression.leaf_id;
    const assetId = asset.id;
    result.set(nftId, {
      nft: { nftId, owner, name, symbol, jsonUri, collection, editionNonce, sellerFeeBasisPoints },
      leafId,
      assetId,
    });
  });
  return result;
};

type AssetResponse = {
  nft: Nft;
  // fields that are only known after successful mint
  leafId: number;
  assetId: string;
};

type MintEvent = {
  signature: string;
  nft: Nft;
};
type Nft = {
  nftId: string; // unique token to identify the nft
  owner: string;
  name: string;
  symbol: string;
  jsonUri: string;
  collection: string;
  editionNonce: number;
  sellerFeeBasisPoints: number;
};
const verifyAsset = async (
  connectionWrapper: WrappedConnection,
  owner: string,
  mintEvents: MintEvent[],
): Promise<number> => {
  let errors = 0;
  const assetsByOwner = await connectionWrapper.getAssetsByOwnerRaw(owner);
  if (!assetsByOwner) {
    console.log(`No assets found for owner ${owner}`);
    return 1;
  }
  // build map of assets from das. <nftId, asset>
  const assetMapFromDas = buildNftTypeMap(assetsByOwner.items);

  for (const event of mintEvents) {
    const nft = event.nft;
    console.log(`Verifying NFT ${nft.nftId} owner: ${nft.owner}`);

    const assetResponse = assetMapFromDas.get(nft.nftId);
    // console.log('assetResponseName', assetResponse?.nft.name);
    if (!shallowEqual(nft, assetResponse?.nft)) {
      console.log('Expected:\n' + JSON.stringify(nft, null, 2));

      console.log('Mint Signature', event.signature);
      console.log('Recieved:\n' + JSON.stringify(assetResponse?.nft, null, 2));

      if (!assetResponse) {
        console.log('Recieved Null from RPC');
      }
      console.log('DAS leafId', assetResponse?.leafId);
      console.log('DAS assetId', assetResponse?.assetId);
      console.log(JSON.stringify(assetsByOwner));
      errors++;
    }
    assetMapFromDas.delete(nft.nftId);
  }
  return errors;
};

// pass in owner to NFT Mint Event map
const verifyCompressedNftsByOwner = async (
  connectionWrapper: WrappedConnection,
  ownerMintEventMap: Map<string, MintEvent[]>,
) => {
  let promises = [];
  for (const [owner, mintEvents] of ownerMintEventMap.entries()) {
    promises.push(verifyAsset(connectionWrapper, owner, mintEvents));
  }
  const responses = await Promise.all(promises);
  const errors = responses.reduce((a, b) => a + b);
  console.log(`Found ${errors} errors`);
};

function readMapFromJsonFile(filepath: string): Map<string, MintEvent[]> {
  // read the JSON file as a string
  const jsonString = fs.readFileSync(filepath, 'utf8');

  // parse the JSON string into an object
  const obj = JSON.parse(jsonString);

  // create a new Map object from the object's entries
  const myMap = new Map<string, MintEvent[]>(Object.entries(obj));

  return myMap;
}

// the following is a script that will mint 5 collections of 100 NFTs each
// no ALT, 1 ixn per txn, 100 sendTxn concurrently
// single merkle tree

// metadata URL uses yoots since there are 15000
const NUM_COLLECTIONS = 3;
const NUM_NFTS_PER_COLLECTION = 1000;
const NUM_NFTS_PER_OWNER = 5;
const CACHE_FILE = 'mint.json';
const mint = async () => {
  // get configs
  const { connectionWrapper, payerWallet, treeWallet } = getConfiguration();

  // initalize merkle tree
  await initTree(connectionWrapper, payerWallet, treeWallet);

  // mint NFTs
  const promises = Array(NUM_COLLECTIONS)
    .fill(0)
    .map(async (_, index) => {
      console.log(`Minting ${NUM_NFTS_PER_COLLECTION} NFTs for collection ${index}`);
      const promise = mintCompressedNfts(
        connectionWrapper,
        payerWallet,
        treeWallet.publicKey,
        index * NUM_NFTS_PER_COLLECTION,
        index,
      );
      return promise;
    });
  const responses = await Promise.all(promises);
  const flatMap: any = [];
  responses.map((response) => {
    flatMap.push(...Array.from(response.entries()));
  });
  const ownerMintEventMap: Map<string, MintEvent[]> = new Map(flatMap);

  const obj = Object.fromEntries(ownerMintEventMap);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
};

const verify = async () => {
  const { connectionWrapper, payerWallet, treeWallet } = getConfiguration();
  const ownerMintEventMap = readMapFromJsonFile(CACHE_FILE);
  await verifyCompressedNftsByOwner(connectionWrapper, ownerMintEventMap);
};

const main = async () => {
  await mint();
  console.log('Finished minting');
  await new Promise((f) => setTimeout(f, 15000));
  await verify();
};
// mint();
// verify();

main();
