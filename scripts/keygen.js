#!/usr/bin/env node
import crypto from "crypto";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519", {
  publicKeyEncoding: {
    type: "spki",
    format: "der",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "der",
  },
});

const publicKeyHex = publicKey.toString("hex");
const privateKeyHex = privateKey.toString("hex");

console.log("Generated Ed25519 keypair for deploydrift license signing\n");
console.log("=== PUBLIC KEY (embed in src/license.ts) ===");
console.log(publicKeyHex);
console.log("\n=== PRIVATE KEY (set as VERCEL env var LICENSE_PRIVATE_KEY) ===");
console.log(privateKeyHex);
console.log("\nIMPORTANT: Keep the private key secret!");
console.log("Set it in Vercel: vercel env add LICENSE_PRIVATE_KEY production");
