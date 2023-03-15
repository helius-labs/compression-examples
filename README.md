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

Similar to e2e, but after minting instead of a transfer a burn instruction will be executed.

```
npm run burn
```
