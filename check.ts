import { ConcurrentMerkleTreeAccount, MerkleTree, MerkleTreeProof, hash } from '@solana/spl-account-compression';
import { Keypair, PublicKey, SlotUpdate } from '@solana/web3.js';
import base58 from 'bs58';
import { WrappedConnection } from './wrappedConnection';
import { getCompressedNftId } from './utils';

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
    const tree = new PublicKey('4A8wVYH2e3SPEsHUPTVcdrNGMmnZoPja9M7K9qxVqXyn');
    const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(connectionWrapper, tree);
    console.log('Root: ' + base58.encode(treeAccount.getCurrentRoot()));
    console.log('Seq: ' + treeAccount.getCurrentSeq());
    console.log('Canopy depth: ' + treeAccount.getCanopyDepth());
    console.log('Max depth: ' + treeAccount.getMaxDepth());

    // Look for empty proofs
    for (let index = 0; index < treeAccount.tree.rightMostPath.index; index++) {
        const assetId = await getCompressedNftId(tree, index);
        const assetInfo = `index: ${index}, id: ${assetId}`;
        if (index % 10 == 0) {
            console.log('checking: ' + assetInfo);
        }
        const proof = await connectionWrapper.getAssetProof(assetId);
        if (proof.root === '') {
            console.log('Empty root ' + assetInfo);
        } else if (proof.proof.every((x: string) => x === '')) {
            console.log('Empty proof ' + assetInfo);
        } else if (proof.proof.find((x: string) => x === '') != undefined) {
            console.log('Partially empty proof ' + assetInfo);
        } else {
            const p = {
                root: new PublicKey(proof.root).toBuffer(),
                proof: proof.proof.map((x: string) => new PublicKey(x).toBuffer()),
                leafIndex: index,
                node_index: proof.node_index,
                leaf: new PublicKey(proof.leaf).toBuffer(),
                tree_id: new PublicKey(proof.tree_id).toBuffer(),
            };
            console.log(proof);
            const verified = verify(p.root, p, false);
            // console.log('Proof verified: ' + verified);
            if (verified == true) {
                console.log('Valid proof: ' + assetInfo);
                // break;
            } else {
                console.log('Invalid proof: ' + assetInfo);
                break;
            }
        }
    }
};

function hashProof(merkleTreeProof: MerkleTreeProof, verbose: boolean = false): Buffer {
    const { leaf, leafIndex, proof } = merkleTreeProof;

    let node = new PublicKey(leaf).toBuffer();
    for (let i = 0; i < proof.length; i++) {
        console.log(leafIndex);
        if ((leafIndex >> i) % 2 === 0) {
            console.log('hashing as left-hand node: ' + i);
            node = hash(node, new PublicKey(proof[i]).toBuffer());
        } else {
            console.log('hashing as right-hand node: ' + i);
            node = hash(new PublicKey(proof[i]).toBuffer(), node);
        }
        if (verbose) console.log(`node ${i} ${new PublicKey(node).toString()}`);
    }
    return node;
}

/**
 * Verifies that a root matches the proof.
 * @param root Root of a MerkleTree
 * @param merkleTreeProof Proof to a leaf in the MerkleTree
 * @param verbose Whether to print hashed nodes
 * @returns Whether the proof is valid
 */
function verify(root: Buffer, merkleTreeProof: MerkleTreeProof, verbose: boolean = false): boolean {
    const node = hashProof(merkleTreeProof, verbose);
    const rehashed = new PublicKey(node).toString();
    const received = new PublicKey(root).toString();
    if (rehashed !== received) {
        if (verbose) console.log(`Roots don't match! Expected ${rehashed} got ${received}`);
        return false;
    }
    if (verbose) console.log(`Hashed ${rehashed} got ${received}`);
    return rehashed === received;
}

const proofForID0 = {
    jsonrpc: '2.0',
    result: {
        root: '42KqMm6LCyrDRF1p58tMWZ3EdazVEmpqjxdP7HtXmE16',
        proof: [
            'GYmrEFLTs9eRTqH6Ss9YpmM9AdFDwif8GaV3HLi8JVzQ',
            '8ADzrEVpBZ7psd5mBT2rBqR7pRN5hyxVCKGE7UzDDVYa',
            'V6h4HxvQueeoZjBVWGg7W1Z5Q2UNPV37QxicrPP2aV1',
            'AKRXh3do9FK8hT2b91Rh6vdJt2SSRmWqbVeHxkD9CtyM',
            'GqBUJb17ej97m33JN5PZRCuqTL3ynztJSSMZqw5eX94b',
            'EFKEARGR8bSVW73SUArfLj48h6tihVzcLJd68gNPYZZp',
            '2SRaCuFSKQCmPmqzvRXC8JVyBeB7phhoNuZxGeYEjSMi',
            '8deuLwMmqX9VdjNePAtB5fhKka8DVMbzds4Ep4gFUbFo',
            'DoRSSkT8dyVtEEA2wHr6c6ES1YyqEV6n4Tor28LA9Mbb',
            'FRSajGCrhAFK7KnnzyJ34sM9jx9p3NmnfccHuSkESY7b',
            '6PTW6C12oJZDT7pkeZwQSUcvQFY3D1UDx5q6i81ov2Sk',
            '6NviHvNRULnh9gezDAvbGU9yxP3Sh7vSuqw2TX5ZR1V6',
            '4fbeWrKkLSXoFrZqpe3m6P7fM9jgy4DTPqerLvMp1Z4M',
            '14RPh6ySBgj6Bh643Y4Z1otmsfrbLJnysEbe1NSfD9fv',
        ],
        node_index: 16384,
        leaf: '7RH16uvjg5h5hCaeCKZYgFyqLRSvButktyXbjNhpmTez',
        tree_id: '4A8wVYH2e3SPEsHUPTVcdrNGMmnZoPja9M7K9qxVqXyn',
    },
    id: '0',
};

const proofForID1 = {
    jsonrpc: '2.0',
    result: {
        root: '42KqMm6LCyrDRF1p58tMWZ3EdazVEmpqjxdP7HtXmE16',
        proof: [
            '7RH16uvjg5h5hCaeCKZYgFyqLRSvButktyXbjNhpmTez',
            '8ADzrEVpBZ7psd5mBT2rBqR7pRN5hyxVCKGE7UzDDVYa',
            'V6h4HxvQueeoZjBVWGg7W1Z5Q2UNPV37QxicrPP2aV1',
            'AKRXh3do9FK8hT2b91Rh6vdJt2SSRmWqbVeHxkD9CtyM',
            'GqBUJb17ej97m33JN5PZRCuqTL3ynztJSSMZqw5eX94b',
            'EFKEARGR8bSVW73SUArfLj48h6tihVzcLJd68gNPYZZp',
            '2SRaCuFSKQCmPmqzvRXC8JVyBeB7phhoNuZxGeYEjSMi',
            '8deuLwMmqX9VdjNePAtB5fhKka8DVMbzds4Ep4gFUbFo',
            'DoRSSkT8dyVtEEA2wHr6c6ES1YyqEV6n4Tor28LA9Mbb',
            'FRSajGCrhAFK7KnnzyJ34sM9jx9p3NmnfccHuSkESY7b',
            '6PTW6C12oJZDT7pkeZwQSUcvQFY3D1UDx5q6i81ov2Sk',
            '6NviHvNRULnh9gezDAvbGU9yxP3Sh7vSuqw2TX5ZR1V6',
            '4fbeWrKkLSXoFrZqpe3m6P7fM9jgy4DTPqerLvMp1Z4M',
            '14RPh6ySBgj6Bh643Y4Z1otmsfrbLJnysEbe1NSfD9fv',
        ],
        node_index: 16385,
        leaf: 'GYmrEFLTs9eRTqH6Ss9YpmM9AdFDwif8GaV3HLi8JVzQ',
        tree_id: '4A8wVYH2e3SPEsHUPTVcdrNGMmnZoPja9M7K9qxVqXyn',
    },
    id: '0',
};

check();
