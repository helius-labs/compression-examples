import { AnchorProvider } from '@project-serum/anchor';
import NodeWallet from '@project-serum/anchor/dist/cjs/nodewallet';
import { Connection, Keypair } from '@solana/web3.js';
import os from 'os';
import axios from 'axios';

export class WrappedConnection extends Connection {
    provider: AnchorProvider;
    payer: Keypair;
    rpcUrl: string;
    localUrl: string;
    useLocalDas: boolean;
    constructor(payer: Keypair, connectionString: string, rpcUrl?: string, useLocalDas: boolean = false) {
        super(connectionString, 'confirmed');
        this.rpcUrl = rpcUrl ?? connectionString;
        this.useLocalDas = useLocalDas;
        // axios gets grumpy with localhost for some reason. Using my IP worked instead.
        // Didn't want to publicly share my IP via github, so here we go instead.
        this.localUrl = `http://${getMachineIPAddress()}:9090`;
        this.provider = new AnchorProvider(new Connection(connectionString), new NodeWallet(payer), {
            commitment: super.commitment,
            skipPreflight: true,
        });
        this.payer = payer;
    }

    async getAsset(assetId: any): Promise<any> {
        try {
            const response = await axios.post(this.useLocalDas ? this.localUrl : this.rpcUrl, {
                jsonrpc: '2.0',
                method: 'get_asset',
                id: 'compression-example',
                params: [assetId],
            });
            return response.data.result;
        } catch (error) {
            console.error(error);
        }
    }

    async getAssetProof(assetId: any): Promise<any> {
        try {
            const response = await axios.post(
                this.useLocalDas ? this.localUrl : this.rpcUrl,
                {
                    jsonrpc: '2.0',
                    method: 'get_asset_proof',
                    id: 'compression-example',
                    params: [assetId],
                },
                { proxy: false },
            );
            return response.data.result;
        } catch (error) {
            console.error(error);
        }
    }

    async getAssetsByOwner(
        assetId: string,
        sortBy: any,
        limit: number,
        page: number,
        before: string,
        after: string,
    ): Promise<any> {
        try {
            const response = await axios.post(this.useLocalDas ? this.localUrl : this.rpcUrl, {
                jsonrpc: '2.0',
                method: 'get_assets_by_owner',
                id: 'compression-example',
                params: [assetId, sortBy, limit, page, before, after],
            });
            return response.data.result;
        } catch (error) {
            console.error(error);
        }
    }
}

function getMachineIPAddress() {
    const networkInterfaces = os.networkInterfaces();
    let ipAddress = '';

    Object.values(networkInterfaces).forEach((interfaces) => {
        interfaces?.forEach((interfaceInfo) => {
            if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
                ipAddress = interfaceInfo.address;
            }
        });
    });

    return ipAddress;
}
