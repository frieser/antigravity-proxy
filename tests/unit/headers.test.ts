import { describe, expect, test } from "bun:test";
import { ANTIGRAVITY_VERSION, generateFingerprint, isAntigravityFingerprintCurrent } from "../../src/utils/headers";

describe("Antigravity client identity", () => {
  test("new fingerprints use the current Antigravity version", () => {
    const fingerprint = generateFingerprint("user@example.com");
    expect(fingerprint.userAgent).toStartWith(`antigravity/${ANTIGRAVITY_VERSION} `);
  });

  test("stale fingerprints are detected by version", () => {
    const fingerprint = generateFingerprint("user@example.com");
    fingerprint.userAgent = "antigravity/1.15.8 darwin/arm64";

    expect(isAntigravityFingerprintCurrent(fingerprint)).toBe(false);
  });
});
