import { Keypair } from "@solana/web3.js";
import base58 from "bs58";
import { redeemAsset } from "./utils";
import { WrappedConnection } from "./wrappedConnection";

const redeem = async () => {
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

  const ownerWallet = Keypair.fromSecretKey(decodedSecretKey);
  console.log("Owner wallet: " + ownerWallet.publicKey);

  const connectionString = `https://rpc-devnet.helius.xyz?api-key=${apiKey}`;
  const connectionWrapper = new WrappedConnection(
    ownerWallet,
    connectionString
  );
  const assetId = require("minimist")(process.argv.slice(2)).assetId;
  const burnSig = await redeemAsset(connectionWrapper, ownerWallet, assetId);
  console.log("Redeem tx: " + burnSig);
};

redeem();
