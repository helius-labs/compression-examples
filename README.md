# NFT Compression Examples

This repository provides examples on how to mint and interact with compressed NFTs.
The examples are based Metaplex's [examples](https://github.com/metaplex-foundation/compression-read-api-js-examples) but are updated to be compatible with the latest API spec and Helius RPCs.

## Scripts

### E2E

Runs a compression example end-to-end. Mints a collection NFT and a compressed NFT for that collection, and then transfers it to another wallet. The transfer calls the Helius compression indexer to verify ownership before transferring and to include the current the proof (minus canopy) in the transfer txn.

```
npm run e2e
```
