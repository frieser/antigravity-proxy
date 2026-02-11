import { type DeviceFingerprint } from "../auth/types";

export const OAUTH_CONFIG = {
  clientId: "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com",
  clientSecret: "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",
  authUri: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUri: "https://oauth2.googleapis.com/token",
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs"
  ],
  redirectUri: (() => {
    const baseUrl = process.env.BASE_URL || "http://localhost:3000";
    return `${baseUrl}/oauth-callback`;
  })()
};

const ANTIGRAVITY_VERSION = "1.15.8";

const PLATFORMS = ["darwin/x64", "darwin/arm64"] as const;

const ARCHITECTURES = ["x64", "arm64"] as const;

const IDE_TYPES = [
  "VSCODE"
] as const;

const PLATFORM_NAMES = [
  "MACOS"
] as const;

const SDK_CLIENTS = [
  "google-cloud-sdk vscode/1.96.0",
  "google-cloud-sdk vscode/1.95.0",
] as const;

const GEMINI_CLI_USER_AGENTS = [
  "google-api-nodejs-client/9.15.1",
  "google-api-nodejs-client/9.14.0",
  "google-api-nodejs-client/9.13.0",
  "google-api-nodejs-client/10.3.0",
] as const;

const GEMINI_CLI_API_CLIENTS = [
  "gl-node/22.17.0",
  "gl-node/22.12.0",
  "gl-node/20.18.0",
  "gl-node/21.7.0",
  "gl-node/22.18.0",
] as const;

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateDeviceId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateStableQuotaUser(email: string): string {
  const hash = Buffer.from(new Bun.CryptoHasher("sha256").update(email).digest()).toString("hex");
  return `device-${hash.substring(0, 16)}`;
}

function generateQuotaUser(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `device-${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

export function generateFingerprint(email?: string): DeviceFingerprint {
  const platform = randomFrom(PLATFORMS);
  const arch = platform.includes("arm64") ? "arm64" : "x64";
  const ideType = "VSCODE";
  const platformName = "MACOS";
  
  const osVersions = ["14.5", "15.0", "15.1", "15.2"];
  const osVersion = randomFrom(osVersions);

  const apiClient = randomFrom(SDK_CLIENTS);
  const sqmId = crypto.randomUUID();

  return {
    userAgent: `antigravity/${ANTIGRAVITY_VERSION} ${platform}`,
    quotaUser: email ? generateStableQuotaUser(email) : generateQuotaUser(),
    deviceId: email ? generateStableQuotaUser(email).replace('device-', '') : generateDeviceId(),
    platform: platform,
    apiClient: apiClient,
    ideType: ideType,
    platformName: platformName,
    sessionToken: generateSessionToken(),
    cliUserAgent: randomFrom(GEMINI_CLI_USER_AGENTS),
    cliApiClient: randomFrom(GEMINI_CLI_API_CLIENTS),
    clientMetadata: {
      ideType: ideType,
      platform: platformName,
      pluginType: "GEMINI",
      osVersion: osVersion,
      arch: arch,
      sqmId: sqmId
    },
    createdAt: Date.now()
  };
}

export function getImpersonationHeaders(accessToken: string, fingerprint?: DeviceFingerprint, model?: string): Record<string, string> {
  const fp = fingerprint || generateFingerprint();
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${ANTIGRAVITY_VERSION} Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36`,
    "X-Goog-Api-Client": fp.apiClient,
    "X-Goog-QuotaUser": fp.quotaUser,
    "X-Client-Device-Id": fp.deviceId,
    "Client-Metadata": fp.clientMetadata
      ? JSON.stringify({ 
          ideType: fp.clientMetadata.ideType, 
          platform: fp.clientMetadata.platform, 
          pluginType: fp.clientMetadata.pluginType,
          osVersion: fp.clientMetadata.osVersion,
          arch: fp.clientMetadata.arch
        })
      : '{"ideType":"VSCODE","platform":"MACOS","pluginType":"GEMINI","osVersion":"15.1","arch":"arm64"}'
  };

  if (model?.toLowerCase().includes("claude") || model?.toLowerCase().includes("anthropic")) {
    headers["anthropic-beta"] = "interleaved-thinking-2025-05-14";
  }
  
  return headers;
}

export function getGeminiCliHeaders(accessToken: string, fingerprint?: DeviceFingerprint): Record<string, string> {
  const fp = fingerprint || generateFingerprint();
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "User-Agent": fp.cliUserAgent,
    "X-Goog-Api-Client": fp.cliApiClient,
    "X-Goog-QuotaUser": fp.quotaUser,
    "X-Client-Device-Id": fp.deviceId,
    "Content-Type": "application/json; charset=utf-8",
  };

  if (fp.clientMetadata) {
    headers["Client-Metadata"] = Object.entries(fp.clientMetadata)
      .filter(([_, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
  } else {
     headers["Client-Metadata"] = "ideType=VSCODE,platform=MACOS,pluginType=GEMINI,osVersion=14.5,arch=arm64";
  }

  return headers;
}

