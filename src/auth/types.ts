export type SelectionStrategy = 'sticky' | 'round-robin' | 'hybrid' | 'random' | 'least-used';

export interface DeviceFingerprint {
  userAgent: string;
  quotaUser: string;
  deviceId: string;
  platform: string;
  apiClient: string;
  ideType: string;
  platformName: string;
  sessionToken: string;
  cliUserAgent: string;
  cliApiClient: string;
  clientMetadata?: {
    ideType: string;
    platform: string;
    pluginType: string;
    osVersion?: string;
    arch?: string;
    sqmId?: string;
  };
  createdAt?: number;
}

export interface AntigravityAccount {
  email: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number; // timestamp
  projectId?: string;
  managedProjectId?: string;
  
  // Rotation stats
  healthScore: number;
  modelScores?: Record<string, number>;
  lastUsed: number;
  tokenUsage: number;
  consecutiveFailures?: number;
  cooldowns?: Record<string, number>;
  history?: Array<{ timestamp: number; status: 'success' | 'error' }>;
  
  // Device fingerprint (persistent per account)
  fingerprint?: DeviceFingerprint;
  
  challenge?: {
    type: string;
    url: string;
    detectedAt: number;
    reason?: string;
    message?: string;
  };
  capabilities?: Record<string, boolean>;
  
  // Quota info (cached)
  quota?: Array<{
    groupName: string; // e.g., "Gemini 1.5 Pro"
    limit: string;
    usage: string;
    limitName: string;
    remainingFraction: number; // 0.0 - 1.0
    quotaLeft: string; // e.g., "80%"
    resetIn: string; // e.g., "14h 20m"
    resetTime?: string; // ISO date
  }>
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  refresh_token?: string;
}
