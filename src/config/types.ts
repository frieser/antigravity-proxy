export interface ProxyConfig {
  rotation: RotationConfig;
  scoring: ScoringConfig;
  models: ModelsConfig;
  retry: RetryConfig;
  tokens: TokensConfig;
  quota: QuotaConfig;
  endpoints: EndpointsConfig;
  logging: LoggingConfig;
  features: FeaturesConfig;
  scheduling: SchedulingConfig;
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

export interface FeaturesConfig {
  /** Enable Google Search grounding for Gemini models */
  googleSearchGrounding: boolean;
  /** Grounding mode: 'auto' lets the model decide, 'always' forces search on every request */
  groundingMode: 'auto' | 'always';
  /** Preserve thinking blocks across conversation turns */
  keepThinking: boolean;
  /** Sanitize MCP tool names that start with numbers or have invalid chars */
  sanitizeToolNames: boolean;
  /** Enable PID-based offset for distributing accounts across parallel agents */
  pidOffsetEnabled: boolean;
  /** Soft quota threshold percentage (0-100). Skip account when quota usage exceeds this. Set to 100 to disable. */
  softQuotaThresholdPercent: number;
}

export interface SchedulingConfig {
  /** Scheduling mode: 'cache_first' waits for same account to preserve prompt cache, 'balance' switches immediately, 'performance_first' round-robins */
  mode: 'cache_first' | 'balance' | 'performance_first';
  /** Max seconds to wait for the same account in cache_first mode before switching */
  maxCacheFirstWaitSeconds: number;
  /** Max seconds to wait when all accounts are rate-limited before erroring */
  maxRateLimitWaitSeconds: number;
}
