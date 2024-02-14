import { Keypair } from '@solana/web3.js';
import { WrappedConnection } from './wrappedConnection';
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes';

const main = async () => {
    const apiKey = process.env['API_KEY'];
    if (!apiKey) {
        throw new Error('Api key must be provided via API_KEY env var');
    }

    const url = `https://rpc.helius.xyz?api-key=${apiKey}`;

    // // Two NFTs from the Tensorian collection.
    // // The "start" item has a lower asset ID (in binary) than the "end" item.
    // // We will traverse in ascending order.
    // let start = '6CeKtAYX5USSvPCQicwFsvN4jQSHNxQuFrX2bimWrNey';
    // let end = 'CzTP4fUbdfgKzwE6T94hsYV7NWf1SzuCCsmJ6RP1xsDw';
    // let sortDirection = 'asc';
    // let after = start;
    // let before = end;
    // let items = [];

    // while (true) {
    //     const response = await fetch(url, {
    //         method: 'POST',
    //         headers: {
    //             'Content-Type': 'application/json',
    //         },
    //         body: JSON.stringify({
    //             jsonrpc: '2.0',
    //             id: 'my-id',
    //             method: 'searchAssets',
    //             params: {
    //                 grouping: ['collection', '5PA96eCFHJSFPY9SWFeRJUHrpoNF5XZL6RrE1JADXhxf'],
    //                 limit: 1000,
    //                 after: after,
    //                 before: before,
    //                 sortBy: { sortBy: 'id', sortDirection: sortDirection },
    //             },
    //         }),
    //     });
    //     const { result } = await response.json();
    //     if (result.items.length == 0) {
    //         console.log('No items remaining');
    //         break;
    //     } else {
    //         console.log(`Processing results with (after: ${after}, before: ${before})`);
    //         after = result.items[result.items.length - 1].id;
    //         items.push(...result.items);
    //     }
    // }
    // console.log(`Got ${items.length} total items`);

    // const connectionWrapper = new WrappedConnection(new Keypair(), connectionString);

    // let start = new Date();

    // Page based
    // let total = 0;
    // for (let i = 0; i < 11; i++) {
    //     console.log('getting page ' + (i + 1));
    //     let res = await connectionWrapper.getAssetsByGroup({
    //         groupKey: 'collection',
    //         groupValue: '5PA96eCFHJSFPY9SWFeRJUHrpoNF5XZL6RrE1JADXhxf',
    //         limit: 1000,
    //         page: i + 1,
    //         sortBy: { sortBy: 'id' },
    //     });
    //     total += res.total;
    // }

    // Keyset with paritioning
    let numParitions = 20;
    let partitons = partitionAddressRange(numParitions);
    let promises = [];
    for (const [i, partition] of partitons.entries()) {
        let [s, e] = partition;
        let start = bs58.encode(s);
        let end = bs58.encode(e);
        console.log(`Parition: ${i}, Start: ${start}, End: ${end}`);

        let promise: Promise<number> = new Promise(async (resolve, reject) => {
            let current = start;
            let totalForPartition = 0;
            while (true) {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 'my-id',
                        method: 'searchAssets',
                        params: {
                            grouping: ['collection', '5PA96eCFHJSFPY9SWFeRJUHrpoNF5XZL6RrE1JADXhxf'],
                            limit: 1000,
                            after: current,
                            before: end,
                            sortBy: { sortBy: 'id', sortDirection: 'asc' },
                        },
                    }),
                });
                const { result } = await response.json();
                totalForPartition += result.items.length;
                console.log(`Found ${totalForPartition} total items in parition ${i}`);
                if (result.items.length == 0) {
                    break;
                } else {
                    current = result.items[result.items.length - 1].id;
                }
            }
            resolve(totalForPartition);
        });
        promises.push(promise);
    }
    let results = await Promise.all(promises);
    let total = results.reduce((a, b) => a + b, 0);
    console.log(`Got ${total} total items`);
};

// Function to convert a BigInt to a byte array
function bigIntToByteArray(bigInt: bigint): Uint8Array {
    const bytes = [];
    let remainder = bigInt;
    while (remainder > 0n) {
        // use 0n for bigint literal
        bytes.unshift(Number(remainder & 0xffn));
        remainder >>= 8n;
    }
    while (bytes.length < 32) bytes.unshift(0); // pad with zeros to get 32 bytes
    return new Uint8Array(bytes);
}

function partitionAddressRange(numPartitions: number) {
    let N = BigInt(numPartitions);

    // Largest and smallest Solana addresses in integer form.
    // Solana addresses are 32 byte arrays.
    const start = 0n;
    const end = 2n ** 256n - 1n;

    // Calculate the number of partitions and partition size
    const range = end - start;
    const partitionSize = range / N;

    // Calculate partition ranges
    const partitions: Uint8Array[][] = [];
    for (let i = 0n; i < N; i++) {
        const s = start + i * partitionSize;
        const e = i === N - 1n ? end : s + partitionSize;
        partitions.push([bigIntToByteArray(s), bigIntToByteArray(e)]);
    }

    return partitions;
}

main();
