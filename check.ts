import { ConcurrentMerkleTreeAccount, MerkleTree } from '@solana/spl-account-compression';
import { Keypair, PublicKey } from '@solana/web3.js';
import base58 from 'bs58';
import { WrappedConnection } from './wrappedConnection';

const check = async () => {
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

    const connectionString = `https://rpc.helius.xyz?api-key=${apiKey}`;
    const connectionWrapper = new WrappedConnection(ownerWallet, connectionString);

    // Check tree
    const tree = new PublicKey('FkiWasg2sef3t3iSHKxrtdfddtAcBTsPbX5sAF7NFTSi');
    const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(connectionWrapper, tree);
    console.log('Root: ' + base58.encode(treeAccount.getCurrentRoot()));
    console.log('Seq: ' + treeAccount.getCurrentSeq());
    console.log('Canopy depth: ' + treeAccount.getCanopyDepth());
    console.log('Max depth: ' + treeAccount.getMaxDepth());

    MerkleTree;
};

check();
