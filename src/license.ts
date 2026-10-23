import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { License } from "./types.js";

const PUBLIC_KEY_HEX =
  "302a300506032b6570032100ce5ea8d2ca25f7d43a2afe1292689c878b23ca5b6645458ba0f8d6f4eefc82f6";

export function validateLicense(key: string): License | null {
  if (!key.startsWith("DC1-")) return null;

  try {
    const [payloadB64, sigB64] = key.slice(4).split(".");
    if (!payloadB64 || !sigB64) return null;

    const payloadBuffer = Buffer.from(payloadB64, "base64url");
    const signatureBuffer = Buffer.from(sigB64, "base64url");
    const publicKeyBuffer = Buffer.from(PUBLIC_KEY_HEX, "hex");

    const isValid = crypto.verify(
      null,
      payloadBuffer,
      {
        key: crypto.createPublicKey({
          key: publicKeyBuffer,
          format: "der",
          type: "spki",
        }),
        dsaEncoding: "ieee-p1363",
      },
      signatureBuffer
    );

    if (!isValid) return null;

    const payload = payloadBuffer.toString("utf-8");
    const license: License = JSON.parse(payload);

    if (!license.email_hash || !license.purchased_at || !license.plan) {
      return null;
    }

    return license;
  } catch {
    return null;
  }
}

export function getLicensePath(): string {
  const configDir = path.join(os.homedir(), ".config", "driftcheck");
  return path.join(configDir, "license.json");
}

export function loadLicense(): License | null {
  const envKey = process.env.DRIFTCHECK_LICENSE;
  if (envKey) {
    return validateLicense(envKey);
  }

  const licensePath = getLicensePath();
  try {
    const content = fs.readFileSync(licensePath, "utf-8");
    const data = JSON.parse(content);
    return validateLicense(data.key);
  } catch {
    return null;
  }
}

export function saveLicense(key: string): boolean {
  const license = validateLicense(key);
  if (!license) return false;

  const licensePath = getLicensePath();
  const configDir = path.dirname(licensePath);

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(
      licensePath,
      JSON.stringify({ key, license }, null, 2),
      "utf-8"
    );
    return true;
  } catch {
    return false;
  }
}

export function getProjectHash(rootDir: string): string {
  try {
    const { execSync } = require("child_process");
    const remoteUrl = execSync("git remote get-url origin", {
      cwd: rootDir,
      encoding: "utf-8",
    }).trim();

    return crypto.createHash("sha256").update(remoteUrl).digest("hex");
  } catch {
    return crypto
      .createHash("sha256")
      .update(path.resolve(rootDir))
      .digest("hex");
  }
}

export function checkFreeTierLimit(rootDir: string): boolean {
  const licensePath = getLicensePath();
  const freeTierPath = path.join(path.dirname(licensePath), "free-tier.json");

  try {
    const content = fs.readFileSync(freeTierPath, "utf-8");
    const data = JSON.parse(content);
    const currentHash = getProjectHash(rootDir);

    return data.projectHash === currentHash;
  } catch {
    const currentHash = getProjectHash(rootDir);
    const configDir = path.dirname(licensePath);

    try {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(
        freeTierPath,
        JSON.stringify({ projectHash: currentHash }, null, 2),
        "utf-8"
      );
      return true;
    } catch {
      return true;
    }
  }
}

export function signLicense(
  email: string,
  privateKeyHex: string
): { key: string; license: License } {
  const emailHash = crypto.createHash("sha256").update(email).digest("hex");

  const license: License = {
    email_hash: emailHash,
    purchased_at: Date.now(),
    plan: "lifetime",
    id: crypto.randomBytes(16).toString("hex"),
  };

  const payloadJson = JSON.stringify(license);
  const payloadBuffer = Buffer.from(payloadJson);
  const payloadB64 = payloadBuffer.toString("base64url");

  const privateKeyBuffer = Buffer.from(privateKeyHex, "hex");

  const privateKey = crypto.createPrivateKey({
    key: privateKeyBuffer,
    format: "der",
    type: "pkcs8",
  });

  const signature = crypto.sign(null, payloadBuffer, {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  const signatureB64 = signature.toString("base64url");
  const key = `DC1-${payloadB64}.${signatureB64}`;

  return { key, license };
}
