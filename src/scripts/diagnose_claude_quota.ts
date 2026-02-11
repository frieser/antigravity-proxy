import { readFileSync } from "fs";
import { join } from "path";
import { getImpersonationHeaders } from "../utils/headers";
import { transformToGoogleBody } from "../utils/transform";

// Usage: bun run src/scripts/diagnose_claude_quota.ts <email>

const email = process.argv[2];
if (!email) {
    console.error("Usage: bun run src/scripts/diagnose_claude_quota.ts <email>");
    process.exit(1);
}

// 1. Load Account
const dbPath = join(process.cwd(), "antigravity-accounts.json");
let accounts = [];
try {
    const data = readFileSync(dbPath, "utf-8");
    const json = JSON.parse(data);
    // Handle both array and object formats (legacy vs new)
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

console.log(`\n=== DIAGNOSING CLAUDE QUOTA FOR: ${account.email} ===`);
console.log(`Project ID: ${account.projectId}`);
console.log(`Health: ${account.healthScore}`);

// 2. Prepare Request
const openaiBody = {
    model: "claude-opus-4-6-thinking",
    messages: [
        { role: "user", content: "Hi" }
    ],
    temperature: 0.7,
    max_tokens: 100
};

// We use useCliPool=false to ensure requestType="agent"
const googleBody = transformToGoogleBody(openaiBody, account.projectId || "rising-fact-p41fc", false, "us-central1");

// 3. Test Endpoints
const endpoints = [
    { name: "SANDBOX (Daily)", url: "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse" },
    { name: "PRODUCTION", url: "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse" },
    { name: "AUTOPUSH", url: "https://autopush-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse" }
];

const headers = {
    ...getImpersonationHeaders(account.accessToken),
    "User-Agent": "antigravity" // Test if this bypasses the ghost quota
};

async function testEndpoint(name: string, url: string) {
    console.log(`\n--- Testing ${name} ---`);
    console.log(`URL: ${url}`);
    
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(googleBody)
        });

        console.log(`Status: ${res.status} ${res.statusText}`);
        
        if (res.ok) {
            console.log("SUCCESS! This endpoint works.");
            // consume stream a bit
            const reader = res.body?.getReader();
            if (reader) {
                const { value } = await reader.read();
                console.log("First chunk received:", new TextDecoder().decode(value).substring(0, 100) + "...");
                reader.cancel();
            }
        } else {
            const text = await res.text();
            console.error("FAILED. Response body:");
            console.error(text.substring(0, 500)); // Print first 500 chars
        }
    } catch (e: any) {
        console.error(`EXCEPTION: ${e.message}`);
    }
}

// Run tests sequentially
for (const ep of endpoints) {
    await testEndpoint(ep.name, ep.url);
}
