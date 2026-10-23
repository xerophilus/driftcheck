import { describe, it, expect } from "vitest";
import { validateLicense, signLicense } from "../src/license.js";

describe("License System", () => {
  it("should sign and validate a license key", () => {
    const privateKey = "test_private_key_12345";
    const email = "test@example.com";

    const { key, license } = signLicense(email, privateKey);

    expect(key).toMatch(/^DC1-/);
    expect(license.plan).toBe("lifetime");
    expect(license.email_hash).toBeDefined();
    expect(license.purchased_at).toBeGreaterThan(0);
    expect(license.id).toBeDefined();

    const validated = validateLicense(key);
    expect(validated).toBeDefined();
    expect(validated?.plan).toBe("lifetime");
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
