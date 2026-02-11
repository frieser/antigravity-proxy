import { type AntigravityAccount, type SelectionStrategy } from "./types";
import { loadConfig, saveConfig } from "./storage";
import { refreshAccessToken, getProjectId } from "./oauth";
import { generateFingerprint } from "../utils/headers";
import { getProxyConfig as getConfigFromManager } from "../config/manager";
import { EventEmitter } from "events";

let accounts: AntigravityAccount[] = [];
let currentStrategy: SelectionStrategy = 'hybrid';
let lastAccountIndex = -1;
const clientStickyMap = new Map<string, string>();
const cooldownMap = new Map<string, number>();

export const eventBus = new EventEmitter();

const MODEL_FAMILIES = {
  'Gemini 3 Flash': (n: string) => n.includes('gemini') && (n.includes('flash') || n.includes('1.5 flash')) && !n.includes('2.5'),
  'Gemini 3 Pro': (n: string) => (n.includes('gemini') && (n.includes('pro') || n.includes('1.5 pro')) || n.includes('image')) && !n.includes('2.5'),
  'Gemini 2.5': (n: string) => n.includes('2.5'),
  'Claude/GPT': (n: string) => n.includes('claude') || n.includes('gpt'),
};

export function getFamilyName(modelName: string) {
  const n = modelName.toLowerCase();
  for (const [family, check] of Object.entries(MODEL_FAMILIES)) {
    if (check(n)) return family;
  }
  return 'Other';
}

function getProxyConfig() {
  return {
    rotation: { cooldown: { defaultDurationMs: 60000, maxDurationMs: 3600000 } },
    scoring: { 
        weights: { health: 2, lru: 0.1 },
        healthRange: { min: 0, max: 100, initial: 100 },
        penalties: { apiError: -10, refreshError: -20, fatalError: -50, systemicError: -10 },
        rewards: { success: 2 }
    },
    tokens: { expiryBufferMs: 60000 }
  };
}

export async function initManager() {
  const config = await loadConfig();
  accounts = config.accounts || [];
  currentStrategy = config.strategy || 'hybrid';
  console.log(`[Manager] Loaded ${accounts.length} accounts from storage.`);
}

export function getAccounts() { return accounts; }
export function getStrategy() { return currentStrategy; }
export function setStrategy(strategy: SelectionStrategy) {
  currentStrategy = strategy;
  saveAccounts(accounts);
}

export async function saveAccounts(newAccounts: AntigravityAccount[]) {
  accounts = newAccounts;
  await saveConfig({ accounts, strategy: currentStrategy });
  eventBus.emit('update', { accounts, strategy: currentStrategy });
}

export function getCooldowns(): Record<string, number> {
  return Object.fromEntries(cooldownMap);
}

export function markCooldown(email: string, pool: 'cli' | 'sandbox', modelFamily: string, resetTimeStr?: string) {
  const config = getProxyConfig();
  const account = accounts.find(a => a.email === email);
  const key = `${email}|${pool}|${modelFamily}`;
  let baseDuration = config.rotation.cooldown.defaultDurationMs;

  if (resetTimeStr) {
    if (resetTimeStr === "0s") return;
    baseDuration = parseDuration(resetTimeStr);
  }

  const consecutive = account?.consecutiveFailures || 0;
  const backoffMultiplier = Math.pow(2, Math.min(consecutive, 5));
  const expiry = Date.now() + Math.min(baseDuration * backoffMultiplier, config.rotation.cooldown.maxDurationMs);

  cooldownMap.set(key, expiry);
  if (account) {
    if (!account.cooldowns) account.cooldowns = {};
    account.cooldowns[`${pool}|${modelFamily}`] = expiry;
    account.consecutiveFailures = (account.consecutiveFailures || 0) + 1;
    saveAccounts(accounts);
  }
  eventBus.emit('cooldown', { cooldowns: Object.fromEntries(cooldownMap) });
}

export function clearCooldown(email: string, pool: string, modelFamily: string) {
  const key = `${email}|${pool}|${modelFamily}`;
  if (cooldownMap.has(key)) {
    cooldownMap.delete(key);
    const account = accounts.find(a => a.email === email);
    if (account && account.cooldowns) {
      delete account.cooldowns[`${pool}|${modelFamily}`];
      account.consecutiveFailures = 0;
      saveAccounts(accounts);
    }
    eventBus.emit('cooldown', { cooldowns: Object.fromEntries(cooldownMap) });
  }
}

export function resetAllCooldowns() {
  cooldownMap.clear();
  for (const account of accounts) {
    account.cooldowns = {};
    account.consecutiveFailures = 0;
  }
  saveAccounts(accounts);
}

export function flagAccountChallenge(email: string, pool: 'cli' | 'sandbox', modelFamily: string, challenge: any) {
  const account = accounts.find(a => a.email === email);
  if (account) {
    const expiry = Date.now() + 3600000;
    const key = `${email}|${pool}|${modelFamily}`;
    cooldownMap.set(key, expiry);
    if (!account.cooldowns) account.cooldowns = {};
    account.cooldowns[`${pool}|${modelFamily}`] = expiry;
    account.challenge = { ...challenge, detectedAt: Date.now() };
    saveAccounts(accounts);
    eventBus.emit('cooldown', { cooldowns: Object.fromEntries(cooldownMap) });
  }
}

function isAccountQuotaExhausted(account: AntigravityAccount, model?: string): boolean {
  let config: ReturnType<typeof getConfigFromManager>;
  try { config = getConfigFromManager(); } catch { return false; }
  const threshold = config.features.softQuotaThresholdPercent;
  if (threshold >= 100 || !account.quota || account.quota.length === 0) return false;

  const family = model ? getFamilyName(model) : null;
  const relevantQuotas = family
    ? account.quota.filter(q => {
        const qLower = q.groupName.toLowerCase();
        const fLower = family.toLowerCase();
        return qLower.includes(fLower) || fLower.includes(qLower) ||
               (fLower.includes('claude') && qLower.includes('claude')) ||
               (fLower.includes('gemini') && qLower.includes('gemini'));
      })
    : account.quota;

  if (relevantQuotas.length === 0) return false;

  const usedPercent = relevantQuotas.reduce((worst, q) => {
    const used = (1 - q.remainingFraction) * 100;
    return Math.max(worst, used);
  }, 0);

  if (usedPercent >= threshold) {
    console.log(`[SoftQuota] Skipping ${account.email} for ${family || 'unknown'}: ${usedPercent.toFixed(1)}% used (threshold: ${threshold}%)`);
    return true;
  }
  return false;
}

function getPidOffset(): number {
  let config: ReturnType<typeof getConfigFromManager>;
  try { config = getConfigFromManager(); } catch { return 0; }
  if (!config.features.pidOffsetEnabled) return 0;
  return process.pid % Math.max(accounts.length, 1);
}

export async function getBestAccount(pool?: 'cli' | 'sandbox', model?: string, clientId?: string, excludeEmails: string[] = [], skipRescue: boolean = false): Promise<AntigravityAccount | null> {
  if (accounts.length === 0) return null;
  const now = Date.now();
  const usable = accounts.filter(a => a.refreshToken && !a.challenge && !excludeEmails.includes(a.email));
  const family = model ? getFamilyName(model) : 'Other';
  
  if (pool) {
    let candidates = usable.filter(a => {
      if (model && a.capabilities?.[model] === false) return false;
      if (isAccountQuotaExhausted(a, model)) return false;
      const expiry = cooldownMap.get(`${a.email}|${pool}|${family}`);
      return !expiry || expiry <= now;
    });

    let schedulingConfig: ReturnType<typeof getConfigFromManager>['scheduling'] | undefined;
    try { schedulingConfig = getConfigFromManager().scheduling; } catch {}

    if (candidates.length === 0 && schedulingConfig?.mode === 'cache_first' && clientId) {
      const stickyEmail = clientStickyMap.get(clientId);
      if (stickyEmail && !excludeEmails.includes(stickyEmail)) {
        const stickyAccount = usable.find(a => a.email === stickyEmail);
        if (stickyAccount) {
          const expiry = cooldownMap.get(`${stickyEmail}|${pool}|${family}`);
          if (expiry && expiry > now) {
            const waitMs = expiry - now;
            const maxWaitMs = (schedulingConfig.maxCacheFirstWaitSeconds || 60) * 1000;
            if (waitMs <= maxWaitMs) {
              console.log(`[CacheFirst] Waiting ${Math.ceil(waitMs / 1000)}s for ${stickyEmail} to preserve prompt cache...`);
              await new Promise(r => setTimeout(r, waitMs));
              return await ensureAccountReady(stickyAccount);
            }
            console.log(`[CacheFirst] ${stickyEmail} cooldown (${Math.ceil(waitMs / 1000)}s) exceeds max wait (${schedulingConfig.maxCacheFirstWaitSeconds}s), switching account.`);
          }
        }
      }
    }

    if (candidates.length === 0 && !skipRescue) {
      candidates = usable.filter(a => !(model && a.capabilities?.[model] === false))
        .filter(a => {
          const expiry = cooldownMap.get(`${a.email}|${pool}|${family}`);
          return !expiry || expiry <= now + 300000;
        })
        .sort((a, b) => {
          const expA = cooldownMap.get(`${a.email}|${pool}|${family}`) || 0;
          const expB = cooldownMap.get(`${b.email}|${pool}|${family}`) || 0;
          return expA - expB;
        });
    }
    
    if (candidates.length === 0) return null;
    
    if (clientId && excludeEmails.length === 0) {
      const stickyEmail = clientStickyMap.get(clientId);
      const sticky = candidates.find(a => a.email === stickyEmail && !cooldownMap.has(`${a.email}|${pool}|${family}`));
      if (sticky) return await ensureAccountReady(sticky);
    }

    const config = getProxyConfig();
    candidates.sort((a, b) => {
        const priorityB = calculatePriority(b, now, model, pool);
        const priorityA = calculatePriority(a, now, model, pool);
        if (Math.abs(priorityA - priorityB) < 0.1) {
            return a.lastUsed - b.lastUsed;
        }
        return priorityB - priorityA;
    });

    const offset = getPidOffset();
    const selectedIndex = offset % candidates.length;
    
    return await ensureAccountReady(candidates[selectedIndex]);
  }
  return null;
}

async function ensureAccountReady(account: AntigravityAccount): Promise<AntigravityAccount | null> {
  const now = Date.now();
  const config = getProxyConfig();
  const needsRefresh = !account.accessToken || (account.expiresAt && account.expiresAt < now + config.tokens.expiryBufferMs);
  
  if (needsRefresh) {
    try {
      const tokens = await refreshAccessToken(account.refreshToken);
      account.accessToken = tokens.access_token;
      account.expiresAt = now + (tokens.expires_in * 1000);
      if (!account.projectId) account.projectId = await getProjectId(account.accessToken) || "rising-fact-p41fc";
      await saveAccounts(accounts);
    } catch (e) {
      account.healthScore = Math.max(0, account.healthScore - 20);
      await saveAccounts(accounts);
      return null;
    }
  }
  return account;
}

function calculatePriority(account: AntigravityAccount, now: number, model?: string, pool?: string): number {
  const config = getProxyConfig();
  const secondsSinceUsed = (now - account.lastUsed) / 1000;
  let health = account.healthScore;
  if (model && pool) {
      const family = getFamilyName(model);
      let score = account.modelScores?.[`${model}|${pool}`];
      
      if (score === undefined && account.modelScores) {
          let sum = 0;
          let count = 0;
          Object.entries(account.modelScores).forEach(([key, val]) => {
              if (key.endsWith(`|${pool}`) && getFamilyName(key.split('|')[0]) === family) {
                  sum += val;
                  count++;
              }
          });
          if (count > 0) score = sum / count;
      }
      
      if (score !== undefined) health = score;
  }
  return (health * config.scoring.weights.health) + (secondsSinceUsed * config.scoring.weights.lru);
}

export async function updateAccountUsage(email: string, success: boolean, model?: string, pool?: string, clientId?: string, status?: number) {
  const account = accounts.find(a => a.email === email);
  if (!account) return;
  if (success && clientId) clientStickyMap.set(clientId, email);
  if (success && pool && model) clearCooldown(email, pool, getFamilyName(model));
  account.lastUsed = Date.now();
  const delta = success ? 2 : (status === 403 ? -50 : -10);
  account.healthScore = Math.max(0, Math.min(100, account.healthScore + delta));
  if (model && pool) {
    if (!account.modelScores) account.modelScores = {};
    const key = `${model}|${pool}`;
    account.modelScores[key] = Math.max(0, Math.min(100, (account.modelScores[key] ?? 100) + delta));
  }
  await saveAccounts(accounts);
}

export function parseDuration(val: string): number {
  const match = val.match(/^(\d+)([smh])$/);
  if (!match) return 60000;
  const amount = parseInt(match[1]);
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000 };
  return amount * multipliers[match[2]];
}

export function flagModelUnsupported(email: string, model: string) {
    const account = accounts.find(a => a.email === email);
    if (account) {
        if (!account.capabilities) account.capabilities = {};
        account.capabilities[model] = false;
        saveAccounts(accounts);
    }
}

export async function resetAccount(email: string) {
    const account = accounts.find(a => a.email === email);
    if (account) {
        account.healthScore = 100;
        account.consecutiveFailures = 0;
        account.cooldowns = {};
        account.modelScores = {};
        account.history = [];
        delete account.challenge;
        const keysToDelete = [];
        for (const [key] of cooldownMap) {
            if (key.startsWith(email + "|")) keysToDelete.push(key);
        }
        for (const key of keysToDelete) cooldownMap.delete(key);
        await saveAccounts(accounts);
    }
}

export async function updateAccountProject(email: string, projectId: string) {
    const account = accounts.find(a => a.email === email);
    if (account) {
        account.projectId = projectId;
        account.managedProjectId = projectId;
        await saveAccounts(accounts);
    }
}

export function getEarliestReset(pool: 'cli' | 'sandbox'): string | null {
  const usable = accounts.filter(a => a.refreshToken && a.quota);
  if (usable.length === 0) return null;
  let resetTimes: number[] = [];
  for (const acc of usable) {
    acc.quota?.forEach(q => {
      if (q.resetTime) {
        const t = new Date(q.resetTime).getTime();
        if (!isNaN(t)) resetTimes.push(t);
      }
    });
  }
  if (resetTimes.length === 0) return null;
  const diffMs = Math.max(0, Math.min(...resetTimes) - Date.now());
  return `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m`;
}

export async function addAccount(account: AntigravityAccount) {
  const existing = accounts.find(a => a.email === account.email);
  if (existing) Object.assign(existing, account);
  else accounts.push(account);
  await saveAccounts(accounts);
}

export async function removeAccount(email: string) {
  accounts = accounts.filter(a => a.email !== email);
  await saveAccounts(accounts);
}

export function emitAccountFlash(email: string, status: 'success' | 'error' = 'success') {
  eventBus.emit('flash', { email, status });
}

export function ensureFingerprint(account: AntigravityAccount): void {
  if (!account.fingerprint || !account.fingerprint.clientMetadata?.sqmId) {
    account.fingerprint = generateFingerprint(account.email);
    saveAccounts(accounts);
  }
}

export function regenerateFingerprint(email: string): void {
  const account = accounts.find(a => a.email === email);
  if (account) {
    account.fingerprint = generateFingerprint(email);
    saveAccounts(accounts);
  }
}
