import { readFileSync } from "fs";
import { join } from "path";
import { getImpersonationHeaders } from "../utils/headers";
import { transformToGoogleBody } from "../utils/transform";

// Usage: bun run src/scripts/test_placeholder_model.ts <email>

const email = process.argv[2];
if (!email) {
    console.error("Usage: bun run src/scripts/test_placeholder_model.ts <email>");
    process.exit(1);
}

// 1. Load Account
const dbPath = join(process.cwd(), "antigravity-accounts.json");
let accounts = [];
try {
    const data = readFileSync(dbPath, "utf-8");
    const json = JSON.parse(data);
    accounts = Array.isArray(json) ? json : (json.accounts || []);
} catch (e) {
    console.error("Could not read antigravity-accounts.json");
    process.exit(1);
}

const account = accounts.find((a: any) => a.email === email);
if (!account) {
    console.error(`Account ${email} not found.`);
    process.exit(1);
}

console.log(`\n=== TESTING antigravity-claude-opus-4-5-thinking-high FOR: ${account.email} ===`);

const openaiBody = {
    model: "claude-opus-4-5-thinking", 
    messages: [
        { role: "user", content: "Hi" }
    ],
    temperature: 0.7,
    max_tokens: 100
};

// Manually construct the body
const effectiveProjectId = account.projectId || "rising-fact-p41fc";
const googleBody = transformToGoogleBody(openaiBody, effectiveProjectId, false, "us-central1"); // requestType=agent

// OVERRIDE MODEL NAME with what the plugin uses
googleBody.model = "antigravity-claude-opus-4-5-thinking-high"; 
console.log("Modified Body Model:", googleBody.model);

// URL
const url = "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse";

const headers = getImpersonationHeaders(account.accessToken);
headers["anthropic-beta"] = "interleaved-thinking-2025-05-14";

async function test() {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(googleBody)
        });

        console.log(`Status: ${res.status} ${res.statusText}`);
        
        if (res.ok) {
            console.log("SUCCESS! MODEL_PLACEHOLDER_M12 works.");
            const reader = res.body?.getReader();
            if (reader) {
                const { value } = await reader.read();
                console.log("First chunk received:", new TextDecoder().decode(value).substring(0, 100) + "...");
                reader.cancel();
            }
        } else {
            const text = await res.text();
            console.error("FAILED. Response body:");
            console.error(text.substring(0, 500)); 
        }
    } catch (e: any) {
        console.error(`EXCEPTION: ${e.message}`);
    }
}

test();
