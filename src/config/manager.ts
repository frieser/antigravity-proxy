import { type ProxyConfig } from './types';
import { EventEmitter } from 'node:events';

const CONFIG_PATH = 'config.json';
export const configEventBus = new EventEmitter();

let config: ProxyConfig;

const DEFAULT_CONFIG: ProxyConfig = {
  rotation: {
    strategy: 'hybrid',
    cooldown: {
      defaultDurationMs: 60000,
      maxDurationMs: 3600000
    }
  },
  scoring: {
    healthRange: {
      min: 0,
      max: 100,
      initial: 100
    },
    penalties: {
      apiError: -10,
      refreshError: -20,
      fatalError: -50,
      systemicError: -5
    },
    rewards: {
      success: 1
    },
    weights: {
      health: 2.0,
      lru: 0.1
    }
  },
  models: {
    blacklist: [],
    routing: {
      sandboxKeywords: ['gpt', 'antigravity', 'image'],
      cliKeywords: ['claude', 'gemini-2.0', 'gemini-2.5', '-preview'],
      forceToSandbox: ['gpt']
    },
    timeouts: {
      'default': 30000,
      'claude': 60000,
      'gemini-3-pro': 45000,
      'gemini-3.1-pro': 45000,
      'thinking': 120000
    }
  },
  retry: {
    maxAttempts: 5,
    transientRetryThresholdSeconds: 5
  },
  tokens: {
    expiryBufferMs: 60000
  },
  quota: {
    refreshIntervalMs: 300000,
    initialDelayMs: 10000
  },
    endpoints: {
      sandbox: [
        'https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse',
        'https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse',
        'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse',
        'https://autopush-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse'
      ],
      cli: [
        'https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse',
        'https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse',
        'https://autopush-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse'
      ]
    },
  logging: {
    maxBufferSize: 200,
    enableConsoleCapture: true
  },
  features: {
    googleSearchGrounding: false,
    groundingMode: 'auto',
    keepThinking: false,
    sanitizeToolNames: true,
    pidOffsetEnabled: false,
    softQuotaThresholdPercent: 90,
    jitterEnabled: true,
    jitterMinMs: 50,
    jitterMaxMs: 300
  },
  scheduling: {
    mode: 'cache_first',
    maxCacheFirstWaitSeconds: 60,
    maxRateLimitWaitSeconds: 300
  }
};

export async function loadProxyConfig(): Promise<ProxyConfig> {
  try {
    const file = Bun.file(CONFIG_PATH);
    const exists = await file.exists();
    
    if (!exists) {
      console.log('[Config] config.json not found, creating with defaults...');
      await saveProxyConfig(DEFAULT_CONFIG);
      config = DEFAULT_CONFIG;
      return config;
    }
    
    const text = await file.text();
    const loadedConfig = JSON.parse(text);
    config = deepMerge(DEFAULT_CONFIG, loadedConfig) as ProxyConfig;
    console.log(`[Config] Loaded configuration: strategy=${config.rotation.strategy}`);
    return config;
  } catch (e) {
    console.error('[Config] Failed to load config.json, using defaults:', e);
    config = DEFAULT_CONFIG;
    return config;
  }
}

export async function saveProxyConfig(newConfig: ProxyConfig): Promise<void> {
  try {
    await Bun.write(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
    config = newConfig;
    configEventBus.emit('update', config);
    console.log('[Config] Configuration saved successfully');
  } catch (e) {
    console.error('[Config] Failed to save config.json:', e);
    throw e;
  }
}

export function getProxyConfig(): ProxyConfig {
  if (!config) {
    throw new Error('[Config] Configuration not initialized. Call loadProxyConfig() first.');
  }
  return config;
}

export async function updateProxyConfig(updates: Partial<ProxyConfig>): Promise<ProxyConfig> {
  const merged = deepMerge(config, updates);
  await saveProxyConfig(merged);
  return merged;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}
