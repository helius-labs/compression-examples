import { TokenProgramVersion, TokenStandard } from '@metaplex-foundation/mpl-bubblegum';
import { ConcurrentMerkleTreeAccount } from '@solana/spl-account-compression';
import { Keypair, PublicKey } from '@solana/web3.js';
import base58 from 'bs58';
import { getCompressedNftId, initCollection, initTree, mintCompressedNft, transferAsset } from './utils';
import { WrappedConnection } from './wrappedConnection';

const e2e = async () => {
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
    // let tree = new PublicKey('1F8W2tM7NPCmZiUzhmW74yEQ7YQkjJCXXC5636iooz3'); // mainnet
    let tree = new PublicKey('BcDFy3R4bWzobPoQJCXNdBWJENeYeRLEBU3cXV2YVmMy'); // devnet

    // UNCOMMENT TO GENERATE A NEW TREE:
    // tree = Keypair.generate();
    // console.log('Tree wallet: ' + treeWallet.publicKey);
    // console.log('Creating merkle tree.');
    // await initTree(connectionWrapper, ownerWallet, treeWallet);

    // UNCOMMENT TO MINT A NEW COLLECTION:
    // const { collectionMint, collectionMetadataAccount, collectionMasterEditionAccount } = await initCollection(
    //     connectionWrapper,
    //     ownerWallet,
    // );
    // console.log('\n===Collection Details===');
    // console.log('Mint account: ' + collectionMint.publicKey.toBase58());
    // console.log('Metadata account: ' + collectionMetadataAccount.toBase58());
    // console.log('Master edition account: ' + collectionMasterEditionAccount.toBase58());
    // console.log('\n');

    // Mint a compressed NFT
    const nftArgs = {
        name: 'Compression Test',
        symbol: 'COMP',
        uri: 'https://arweave.net/gfO_TkYttQls70pTmhrdMDz9pfMUXX8hZkaoIivQjGs',
        creators: [],
        editionNonce: 253,
        tokenProgramVersion: TokenProgramVersion.Original,
        tokenStandard: TokenStandard.NonFungible,
        uses: null,
        collection: null,
        primarySaleHappened: false,
        sellerFeeBasisPoints: 0,
        isMutable: false,
    };
    const sig = await mintCompressedNft(connectionWrapper, nftArgs, ownerWallet, tree);
    console.log('Minted compressed nft with txn: ' + sig);

    // Get the NFT mint ID from the merkle tree.
    const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(connectionWrapper, tree);
    // Get the most rightmost leaf index, which will be the most recently minted compressed NFT.
    // Alternatively you can keep a counter that is incremented on each mint.
    const leafIndex = treeAccount.tree.rightMostPath.index - 1;
    const assetId = await getCompressedNftId(tree, leafIndex);
    console.log('Minted asset: ' + assetId);

    // Fixed wallet to receive the NFT when we test transfer.
    const newOwnerWallet = Keypair.fromSeed(new TextEncoder().encode('next wallet'.padEnd(32, '\0')));
    console.log('New owner wallet: ' + newOwnerWallet.publicKey.toBase58());

    console.log('\n===Transfer===');
    console.log('Transfer to new wallet.');
    await transferAsset(connectionWrapper, ownerWallet, newOwnerWallet.publicKey, assetId.toBase58());
    console.log('Successfully transferred nft to wallet: ' + newOwnerWallet.publicKey.toBase58());
};

e2e();
