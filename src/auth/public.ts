import { type AntigravityAccount } from "./types";

type PublicFingerprint = {
  userAgent: string;
  platform: string;
  apiClient: string;
  ideType: string;
  platformName: string;
  cliUserAgent: string;
  cliApiClient: string;
  createdAt?: number;
  clientMetadata?: {
    ideType: string;
    platform: string;
    pluginType: string;
    osVersion?: string;
    arch?: string;
  };
};

export type PublicAccount = Omit<AntigravityAccount, "refreshToken" | "accessToken" | "fingerprint"> & {
  fingerprint?: PublicFingerprint;
};

export function toPublicAccount(account: AntigravityAccount): PublicAccount {
  const { refreshToken: _refreshToken, accessToken: _accessToken, fingerprint, ...rest } = account;

  return {
    ...rest,
    fingerprint: fingerprint ? {
      userAgent: fingerprint.userAgent,
      platform: fingerprint.platform,
      apiClient: fingerprint.apiClient,
      ideType: fingerprint.ideType,
      platformName: fingerprint.platformName,
      cliUserAgent: fingerprint.cliUserAgent,
      cliApiClient: fingerprint.cliApiClient,
      createdAt: fingerprint.createdAt,
      clientMetadata: fingerprint.clientMetadata ? {
        ideType: fingerprint.clientMetadata.ideType,
        platform: fingerprint.clientMetadata.platform,
        pluginType: fingerprint.clientMetadata.pluginType,
        osVersion: fingerprint.clientMetadata.osVersion,
        arch: fingerprint.clientMetadata.arch
      } : undefined
    } : undefined
  };
}

export function toPublicAccounts(accounts: AntigravityAccount[]) {
  return accounts.map(toPublicAccount);
}
