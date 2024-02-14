import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { mplBubblegum } from '@metaplex-foundation/mpl-bubblegum'
import base58 from 'bs58';

const update = async () => {
    const apiKey = process.env["API_KEY"];
    if (!apiKey) {
        throw new Error("Api key must be provided via API_KEY env var");
    }

    const secretKey = process.env["SECRET_KEY"];
    if (!secretKey) {
    throw new Error(
        "Wallet secret key must be provided via SECRET_KEY env var"
    );
    }
    let decodedSecretKey;
    
    try {
        decodedSecretKey = base58.decode(secretKey);
    } catch {
        throw new Error(
            "Invalid secret key provided. Must be a base 58 encoded string."
        );
    }

    // Use the RPC endpoint of your choice.
    const umi = createUmi(`https://devnet.helius-rpc.com?api-key=${apiKey}`).use(mplBubblegum())

}