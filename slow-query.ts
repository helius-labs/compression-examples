import { Keypair } from '@solana/web3.js';
import { WrappedConnection } from './wrappedConnection';

const check = async () => {
    const apiKey = process.env['API_KEY'];
    if (!apiKey) {
        throw new Error('Api key must be provided via API_KEY env var');
    }

    const connectionString = `https://rpc.helius.xyz?api-key=${apiKey}`;
    const connectionWrapper = new WrappedConnection(new Keypair(), connectionString, connectionString, false);

    let concurrency = 100;
    let promises = [];
    let base = 0;
    while (true) {
        for (let i = 1 + base; i < concurrency + base; i++) {
            const p = connectionWrapper
                .getAssetsByGroup({
                    groupKey: 'collection',
                    groupValue: 'DGPTxgKaBPJv3Ng7dc9AFDpX6E7kgUMZEgyTm3VGWPW6',
                    sortBy: {
                        sortBy: 'none',
                    },
                    limit: 100,
                    page: i,
                })
                .then((res) => console.log('got result for page: ' + i + ' items: ' + res?.items.length));
            promises.push(p);
        }
        await Promise.all(promises).then(() => console.log('done batch'));
        base += concurrency;
    }
};

check();
