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

const PLATFORMS = ["darwin/x64", "darwin/arm64", "win32/x64", "linux/x64", "linux/arm64", "windows/amd64", "linux/amd64", "darwin/amd64"] as const;

const ARCHITECTURES = ["x64", "arm64"] as const;

const IDE_TYPES = [
  "IDE_UNSPECIFIED",
  "VSCODE",
  "INTELLIJ",
  "ANDROID_STUDIO",
  "CLOUD_SHELL_EDITOR",
] as const;

const PLATFORM_NAMES = [
  "PLATFORM_UNSPECIFIED",
  "WINDOWS",
  "MACOS",
  "LINUX",
] as const;

const SDK_CLIENTS = [
  "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "google-cloud-sdk vscode/1.86.0",
  "google-cloud-sdk vscode/1.87.0",
  "google-cloud-sdk vscode/1.95.0",
  "google-cloud-sdk vscode/1.96.0",
  "google-cloud-sdk jetbrains/2024.3",
  "google-cloud-sdk intellij/2024.1",
  "gcloud-python/1.2.0 grpc-google-iam-v1/0.12.6",
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

function generateStableClientMetadata(): NonNullable<DeviceFingerprint["clientMetadata"]> {
  return {
    ideType: "VSCODE",
    platform: "MACOS",
    pluginType: "GEMINI",
    osVersion: "14.5",
    arch: "arm64",
    sqmId: "5698064b-0196-4874-9a99-b148006e885c"
  };
}

function generateQuotaUser(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `device-${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

export function generateFingerprint(email?: string): DeviceFingerprint {
  const platform = "darwin/arm64";
  const arch = "arm64";
  const ideType = "VSCODE";
  const platformName = "MACOS";
  const apiClient = "google-cloud-sdk vscode/1.96.0";

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
    clientMetadata: generateStableClientMetadata(),
    createdAt: Date.now()
  };
}

export function getImpersonationHeaders(accessToken: string, fingerprint?: DeviceFingerprint, model?: string): Record<string, string> {
  const fp = fingerprint || generateFingerprint();
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/${ANTIGRAVITY_VERSION} Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36`,
    "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
    "X-Goog-QuotaUser": fp.quotaUser,
    "X-Client-Device-Id": fp.deviceId,
    "Client-Metadata": '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}'
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

