import { describe, it, expect } from "vitest";
import { validateLicense, signLicense } from "../src/license.js";
import crypto from "crypto";

describe("License System", () => {
  it("should sign and validate a license key with Ed25519", () => {
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

    const privateKeyHex = privateKey.toString("hex");
    const email = "test@example.com";

    const { key, license } = signLicense(email, privateKeyHex);

    expect(key).toMatch(/^DC1-/);
    expect(license.plan).toBe("lifetime");
    expect(license.email_hash).toBeDefined();
    expect(license.purchased_at).toBeGreaterThan(0);
    expect(license.id).toBeDefined();
  });

  it("should reject keys signed with a different keypair", () => {
    const { privateKey: privateKey1 } = crypto.generateKeyPairSync("ed25519", {
      privateKeyEncoding: {
        type: "pkcs8",
        format: "der",
      },
    });

    const { privateKey: privateKey2 } = crypto.generateKeyPairSync("ed25519", {
      privateKeyEncoding: {
        type: "pkcs8",
        format: "der",
      },
    });

    const privateKeyHex1 = privateKey1.toString("hex");
    const privateKeyHex2 = privateKey2.toString("hex");

    const { key: key1 } = signLicense("test@example.com", privateKeyHex1);
    const { key: key2 } = signLicense("test@example.com", privateKeyHex2);

    expect(key1).not.toBe(key2);

    const validated = validateLicense(key1);
    expect(validated).toBeNull();

    const validated2 = validateLicense(key2);
    expect(validated2).toBeNull();
  });

  it("should reject invalid license keys", () => {
    const invalid = validateLicense("INVALID_KEY");
    expect(invalid).toBeNull();

    const malformed = validateLicense("DC1-bad.format");
    expect(malformed).toBeNull();
  });

  it("should handle malformed base64 gracefully", () => {
    const invalid = validateLicense("DC1-not_valid_base64.sig");
    expect(invalid).toBeNull();
  });
});
