import { describe, expect, test } from "bun:test";
import { toPublicAccount } from "../../src/auth/public";

describe("public account serialization", () => {
  test("redacts tokens and fingerprint secrets", () => {
    const account: any = {
      email: "user@example.com",
      refreshToken: "refresh-secret",
      accessToken: "access-secret",
      expiresAt: 123,
      projectId: "project",
      healthScore: 100,
      lastUsed: 0,
      tokenUsage: 0,
      fingerprint: {
        userAgent: "antigravity/1.0.13 darwin/arm64",
        quotaUser: "device-secret",
        deviceId: "device-secret",
        platform: "darwin/arm64",
        apiClient: "google-cloud-sdk vscode/1.95.0",
        ideType: "VSCODE",
        platformName: "MACOS",
        sessionToken: "session-secret",
        cliUserAgent: "google-api-nodejs-client/9.15.1",
        cliApiClient: "gl-node/21.7.0",
        clientMetadata: { ideType: "VSCODE", platform: "MACOS", pluginType: "GEMINI", sqmId: "sqm-secret" }
      }
    };

    const publicAccount = toPublicAccount(account) as any;

    expect(publicAccount.refreshToken).toBeUndefined();
    expect(publicAccount.accessToken).toBeUndefined();
    expect(publicAccount.fingerprint.sessionToken).toBeUndefined();
    expect(publicAccount.fingerprint.quotaUser).toBeUndefined();
    expect(publicAccount.fingerprint.deviceId).toBeUndefined();
    expect(publicAccount.fingerprint.clientMetadata.sqmId).toBeUndefined();
  });
});
