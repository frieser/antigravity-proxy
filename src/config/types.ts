export interface ProxyConfig {
  rotation: RotationConfig;
  scoring: ScoringConfig;
  models: ModelsConfig;
  retry: RetryConfig;
  tokens: TokensConfig;
  quota: QuotaConfig;
  endpoints: EndpointsConfig;
  logging: LoggingConfig;
}

export interface RotationConfig {
  strategy: 'hybrid' | 'sticky' | 'round-robin' | 'random' | 'least-used';
  cooldown: {
    defaultDurationMs: number;
    maxDurationMs: number;
  };
}

export interface ScoringConfig {
  healthRange: {
    min: number;
    max: number;
    initial: number;
  };
  penalties: {
    apiError: number;
    refreshError: number;
    fatalError: number;
    systemicError: number;
  };
  rewards: {
    success: number;
  };
  weights: {
    health: number;
    lru: number;
  };
}

export interface ModelsConfig {
  blacklist: string[];
  routing: {
    sandboxKeywords: string[];
    cliKeywords: string[];
    forceToSandbox: string[];
  };
  timeouts: Record<string, number>;
}

export interface RetryConfig {
  maxAttempts: number;
  transientRetryThresholdSeconds: number;
}

export interface TokensConfig {
  expiryBufferMs: number;
}

export interface QuotaConfig {
  refreshIntervalMs: number;
  initialDelayMs: number;
}

export interface EndpointsConfig {
  sandbox: string[];
  cli: string | string[];
}

export interface LoggingConfig {
  maxBufferSize: number;
  enableConsoleCapture: boolean;
}
