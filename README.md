# NFT Compression Examples

This repository provides examples on how to mint and interact with compressed NFTs.
The examples are based Metaplex's [examples](https://github.com/metaplex-foundation/compression-read-api-js-examples) but are updated to be compatible with the latest API spec and Helius RPCs.

## Scripts

### E2E

Runs a compression example end-to-end. Mints a collection NFT and a compressed NFT for that collection, and then transfers it to another wallet. The transfer calls the Helius compression indexer to verify ownership before transferring and to include the current proof in the transfer txn.

Note: This example does not use a canopy for simplicity. A canopy is an on-chain cache that reduces the size of the proofs required. This is useful for production apps that require large trees.

```
npm run e2e
```

### BURN

Provided the assetId of a compressd nft owned by the wallet passed in SECRET_KEY, this script proceeds to burn it.

```
npm run burn -- --assetId=<base58 encoded assetId>
```

### REDEEM

Provided the assetId of a compressd nft owned by the wallet passed in SECRET_KEY, this script redeems an NFT (remove from tree and store in a voucher PDA).

```
npm run redeem -- --assetId=<base58 encoded assetId>
```

### CANCEL REDEEM

Provided the assetId of a compressd nft owned by the wallet passed in SECRET_KEY, this script cancels the redemption of an NFT (Put the NFT back into the Merkle tree).

```
npm run cancel-redeem -- --assetId=<base58 encoded assetId>
```
