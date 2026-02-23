import { getImpersonationHeaders, generateFingerprint } from "../utils/headers";
import { type AntigravityAccount } from "../auth/types";
import { getAccounts, saveAccounts } from "../auth/manager";
import { refreshAccessToken } from "../auth/oauth";

export async function fetchQuota(account: AntigravityAccount, retry = true): Promise<AntigravityAccount['quota'] | null> {
  if (!account.projectId || !account.accessToken) return null;
  
  if (!account.fingerprint || !account.fingerprint.clientMetadata?.sqmId) {
    account.fingerprint = generateFingerprint(account.email);
  }

  try {
    const res = await fetch(`https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`, {
      method: "POST",
      headers: {
        ...getImpersonationHeaders(account.accessToken, account.fingerprint),
        "User-Agent": "antigravity",
      },
      body: JSON.stringify({
        project: account.projectId
      })
    });

    if (res.status === 401 && retry) {
      console.log(`Quota fetch 401 for ${account.email}, refreshing token...`);
      try {
        const tokens = await refreshAccessToken(account.refreshToken);
        account.accessToken = tokens.access_token;
        account.expiresAt = Date.now() + (tokens.expires_in * 1000);
        await saveAccounts(getAccounts());
        return fetchQuota(account, false); // Retry once
      } catch (e) {
        console.error(`Failed to refresh token for ${account.email} during quota fetch`, e);
        return null;
      }
    }

    if (!res.ok) {
        console.error(`Quota fetch failed for ${account.email}: ${res.status}`);
        return null;
    }

    return parseQuotaResponse(await res.json());
  } catch (e) {
    console.error(`Error fetching quota for ${account.email}`, e);
  }
  return null;
}

function getNextMidnightPT(): string {
    const now = new Date();
    const ptDateStr = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    const ptDate = new Date(ptDateStr);
    
    const midnightPT = new Date(ptDate);
    midnightPT.setHours(24, 0, 0, 0);
    
    const diffMs = midnightPT.getTime() - ptDate.getTime();
    return new Date(now.getTime() + diffMs).toISOString();
}

export const supportedModelsCache: Set<string> = new Set();

function parseQuotaResponse(data: any): AntigravityAccount['quota'] | null {
    // Handle both array and map formats
    let rawModels = data.availableModels || data.models || [];
    let entries: [string, any][] = [];
    if (!Array.isArray(rawModels) && typeof rawModels === 'object') {
        entries = Object.entries(rawModels);
    } else {
        entries = rawModels.map(m => [m.model?.name || m.displayName || m.displayMetadata?.label || "Unknown", m]);
    }
    
    const groups = new Map<string, any>();

    for (const [key, m] of entries) {
        if (!m.quotaInfo) continue;

        const label = m.displayMetadata?.label || m.displayName || m.model?.name || "Unknown";
        const lowerLabel = label.toLowerCase();
        
        // Skip unknown or placeholder models
        if (label === "Unknown" || lowerLabel === "unknown") continue;

        // Cache supported model ID/Name
        const modelId = key.replace("models/", "");
        // If the key is a valid ID without spaces, cache it. Otherwise cache label.
        if (modelId && modelId !== "Unknown" && !modelId.includes(" ")) {
            supportedModelsCache.add(modelId);
        } else if (label !== "Unknown") {
            supportedModelsCache.add(label);
        }

        const allowedPatterns = [
            "Claude",
            "Anthropic",
            "GPT",
            "Gemini",
            "chat",
            "tab_flash",
            "MODEL_PLACEHOLDER"
        ];

        const isAllowed = allowedPatterns.some(pattern => label.includes(pattern));
        
        if (!isAllowed) continue;

        const remainingFraction = m.quotaInfo.remainingFraction ?? 0;
        
        const limitName = m.quotaInfo.limitName || label;

        if (groups.has(limitName)) {
            const group = groups.get(limitName);
            // Append label if not already present
            if (!group.labels.includes(label)) {
                group.labels.push(label);
                group.labels.sort();
                group.groupName = group.labels.join(" / ");
            }
        } else {
            let resetTime = m.quotaInfo.quotaResetTime || 
                           m.quotaResetTime || 
                           m.quotaInfo.resetTime || 
                           m.resetTime || 
                           m.quotaInfo.nextResetTime || 
                           m.nextResetTime ||
                           m.quotaInfo.quota_reset_time ||
                           m.quota_reset_time;
            
            if (typeof resetTime === 'number') {
                if (resetTime < 10000000000) resetTime *= 1000;
                resetTime = new Date(resetTime).toISOString();
            }
            
            if (typeof resetTime === 'string' && resetTime.endsWith('s') && /^\d+/.test(resetTime)) {
                const seconds = parseInt(resetTime, 10);
                if (!isNaN(seconds)) {
                    resetTime = new Date(Date.now() + seconds * 1000).toISOString();
                }
            }

            if (!resetTime || Number.isNaN(new Date(resetTime).getTime())) {
                resetTime = getNextMidnightPT();
            }

            const diffMs = Math.max(0, new Date(resetTime).getTime() - Date.now());
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const resetIn = `${hours}h ${minutes}m`;
            const pct = Math.round(remainingFraction * 100);
            const quotaLeft = `${pct}%`;

            groups.set(limitName, {
                groupName: label,
                labels: [label], 
                limit: m.quotaInfo.quotaLimit || "Unknown",
                usage: m.quotaInfo.quotaUsage || "Unknown",
                limitName: limitName,
                remainingFraction: remainingFraction,
                resetTime: resetTime,
                quotaLeft,
                resetIn
            });
        }
    }

    const results = Array.from(groups.values()).map(g => {
        const { labels, ...rest } = g; 
        return rest;
    });

    // Sort by name for consistency
    results.sort((a, b) => a.groupName.localeCompare(b.groupName));

    return results.length > 0 ? results : null;
}

export async function refreshAllQuotas() {
    const accounts = getAccounts();
    
    await Promise.all(accounts.map(async (acc) => {
        if (acc.projectId) { 
            const quota = await fetchQuota(acc);
            if (quota) {
                acc.quota = quota;
                await saveAccounts(getAccounts());
            }
        }
    }));
}
