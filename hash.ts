import { ConcurrentMerkleTreeAccount, MerkleTree, MerkleTreeProof, hash } from '@solana/spl-account-compression';
import { ConfirmedSignatureInfo, Connection, Keypair, PublicKey, SlotUpdate } from '@solana/web3.js';
import base58 from 'bs58';
import { WrappedConnection } from './wrappedConnection';
import { getCompressedNftId } from './utils';
import { sleep } from '@metaplex-foundation/amman/dist/utils';
import axios from 'axios';
import { MetadataArgs, metadataArgsBeet } from '@metaplex-foundation/mpl-bubblegum';
import { keccak_256 } from 'js-sha3';
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes';
const fetch = require('node-fetch');

async function web3jsFetch(input: any, init?: any): Promise<any> {
    const processedInput = typeof input === 'string' && input.slice(0, 2) === '//' ? 'https:' + input : input;
    return await fetch.default(processedInput, init);
}

const check = async () => {
    while (true) {
        let i = 0;
        const base = 'http://localhost:8000';
        // const base = 'https://api.helius.xyz/v0';
        // const before =
        //     '&before=5WApNBMj8NLv76kc3WXzMBH2KWcid5SwP1KS1QhutcTxp4jjwtcwgpv5CDX2xmepuKcM1mE5fF9sxjKL5Kynv9Ux';
        const before = '';
        const res = await fetch(
            `${base}/addresses/Gf5eLN4BBrrfadJs3sXyiaTj3LhoCdCZsgRpaKzCgHk/transactions?api-key=c8f7dcc1-551b-4547-ac0d-d868a996b2cf${before}`,
        );
        const parsed = await res.json();
        if (parsed.length == 0) {
            console.log(new Date().toISOString() + ': Empty!!!');
        } else if (i % 10 == 0) {
            console.log(new Date().toISOString() + ': ' + parsed.length);
        }
    }

    // const apiKey = process.env['API_KEY'];
    // if (!apiKey) {
    //     throw new Error('Api key must be provided via API_KEY env var');
    // }

    // const secretKey = process.env['SECRET_KEY'];
    // if (!secretKey) {
    //     throw new Error('Wallet secret key must be provided via SECRET_KEY env var');
    // }
    // let decodedSecretKey;
    // try {
    //     decodedSecretKey = base58.decode(secretKey);
    // } catch {
    //     throw new Error('Invalid secret key provided. Must be a base 58 encoded string.');
    // }

    // const ownerWallet = Keypair.fromSecretKey(decodedSecretKey);
    // console.log('Owner wallet: ' + ownerWallet.publicKey);

    // const connectionString = `https://rpc.helius.xyz?api-key=${apiKey}`;
    // const connectionWrapper = new WrappedConnection(ownerWallet, connectionString, connectionString, false);

    // const badMint = '8fehQzd4QK3ymmDtiLvGWxjMJagZpThiKzdWXrRroTKF';
    // const assetRes = await connectionWrapper.getAsset(badMint);
    // const proofRes = await connectionWrapper.getAssetProof(badMint);

    // const {
    //     compression,
    //     content,
    //     royalty,
    //     creators,
    //     uses,
    //     grouping,
    //     supply,
    //     ownership: { owner, delegate },
    //     mutable,
    // } = assetRes;
    // const { proof, root } = proofRes;

    // if (!compression || !proof || !root) {
    //     console.error(`partial data returned for ${badMint}`);
    //     return null;
    // }

    // const coll = grouping.find((g: any) => g.group_key === 'collection')?.group_value;

    // //ordering follows https://docs.metaplex.com/programs/token-metadata/accounts
    // const metadata: MetadataArgs = {
    //     name: content?.metadata?.name ?? '',
    //     symbol: content?.metadata?.symbol ?? ' ',
    //     uri: content?.json_uri ?? '',
    //     sellerFeeBasisPoints: royalty.basis_points,
    //     creators: creators.map((creator: any) => ({
    //         address: new PublicKey(creator.address),
    //         share: creator.share,
    //         verified: creator.verified,
    //     })),
    //     primarySaleHappened: royalty.primary_sale_happened,
    //     isMutable: mutable,
    //     editionNonce: !supply?.edition_nonce ? supply!.edition_nonce : null,
    //     //TODO: currently always NFT (cant import enum since dont have mplex lib)
    //     tokenStandard: 0,
    //     //if helius shows a collection in groupings for a cNFT then it's verified
    //     collection: coll ? { key: new PublicKey(coll), verified: true } : null,
    //     uses: uses
    //         ? {
    //               useMethod: uses.use_method === 'Burn' ? 0 : uses.use_method === 'Multiple' ? 1 : 2,
    //               remaining: uses.remaining,
    //               total: uses.total,
    //           }
    //         : null,
    //     //TODO: currenlty always Original (cant import enum since dont have mplex lib)
    //     tokenProgramVersion: 0,
    // };

    // const computedHash = computeMetadataArgsHash(metadata);

    // console.log('computed: ' + bs58.encode(computedHash));
    // console.log('original: ' + compression.metadata_hash);

    // // Compare to asset hash

    // console.log(assetRes.ownership.owner);
    // console.log(assetRes.ownership.delegate);
    // console.log(assetRes.compression.leaf_id);

    // const assetHash = Buffer.from(
    //     keccak_256.digest([
    //         [0],
    //         badMint,
    //         base58.decode(assetRes.ownership.owner),
    //         assetRes.ownership.delegate ? base58.decode(assetRes.ownership.delegate) : null,
    //         assetRes.compression.leaf_id,
    //         bs58.decode('9Da5YEqPCb421q64Uv9exYitjvu9oHHPn6EbdzLKBeXe'),
    //         bs58.decode('4KGDaarDWeft7gUZ7tJE4uUZ3f6iRUwTDXgL4uQtwsso'),
    //     ]),
    // );
    // console.log('asset hash: ' + bs58.encode(assetHash));

    // // Bubblegum code:
    // // keccak::hashv(&[
    // //     &[self.version().to_bytes()],
    // //     id.as_ref(),
    // //     owner.as_ref(),
    // //     delegate.as_ref(),
    // //     nonce.to_le_bytes().as_ref(),
    // //     data_hash.as_ref(),
    // //     creator_hash.as_ref(),
    // // ])
};

export function computeMetadataArgsHash(metadata: MetadataArgs): Buffer {
    const [serializedMetadata] = metadataArgsBeet.serialize(metadata);
    return Buffer.from(keccak_256.digest(serializedMetadata));
}

check();
