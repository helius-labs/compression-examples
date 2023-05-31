import { ConcurrentMerkleTreeAccount, MerkleTree, MerkleTreeProof, hash } from '@solana/spl-account-compression';
import { ConfirmedSignatureInfo, Keypair, PublicKey, SlotUpdate } from '@solana/web3.js';
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
    const connectionWrapper = new WrappedConnection(ownerWallet, connectionString, connectionString, false);

    // Check tree

    // const tree = new PublicKey('Cu61XHSkbasbvBc3atv5NUMz6C8FYmocNkH7mtjLFjR7');
    const tree = new PublicKey('36jge8tHxMamiYHqa47d9v1WokRxjMvMa4Wh7x3fAjs8');
    const treeAccount = await ConcurrentMerkleTreeAccount.fromAccountAddress(connectionWrapper, tree);
    console.log('Root: ' + base58.encode(treeAccount.getCurrentRoot()));
    console.log('Seq: ' + treeAccount.getCurrentSeq());
    console.log('Canopy depth: ' + treeAccount.getCanopyDepth());
    console.log('Max depth: ' + treeAccount.getMaxDepth());

    // Look for empty proofs
    let promises = [];
    for (let index = 0; index < treeAccount.tree.rightMostPath.index; index++) {
        const assetId = await getCompressedNftId(tree, index);
        const assetInfo = `index: ${index}, id: ${assetId}`;
        if (index % 10 == 0) {
            console.log('checking: ' + assetInfo);
        }
        const promise = connectionWrapper.getAssetProof(assetId).then((proof) => {
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
                const verified = verify(p.root, p, false);
                if (verified == true) {
                    console.log('Valid proof: ' + assetInfo);
                } else {
                    console.log('Invalid proof: ' + assetInfo);
                    throw new Error('Invalid proof');
                }
            }
        });
        promises.push(promise);
        if (promises.length > 50) {
            await Promise.all(promises);
            promises = [];
        }
    }
};

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

function hashProof(merkleTreeProof: MerkleTreeProof, verbose: boolean = false): Buffer {
    const { leaf, leafIndex, proof } = merkleTreeProof;

    let node = new PublicKey(leaf).toBuffer();
    for (let i = 0; i < proof.length; i++) {
        if ((leafIndex >> i) % 2 === 0) {
            // console.log(
            //     `Hashing together next proof value ${base58.encode(node)} (index: ${i}) with ${base58.encode(
            //         proof[i],
            //     )}`,
            // );
            node = hash(node, new PublicKey(proof[i]).toBuffer());
        } else {
            // console.log('hashing as right-hand node: ' + i);
            node = hash(new PublicKey(proof[i]).toBuffer(), node);
        }
        if (verbose) console.log(`node ${i} ${new PublicKey(node).toString()}`);
    }
    return node;
}

check();
