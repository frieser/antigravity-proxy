import { getGeminiCliHeaders } from "../utils/headers";
import { transformToGoogleBody } from "../utils/transform";
import { getAccounts, initManager } from "../auth/manager";

// Manual test to see if Claude works on CLI endpoint
// Usage: bun run src/scripts/test-claude-cli.ts <email>

await initManager();

const email = process.argv[2];
if (!email) {
    console.error("Usage: bun run src/scripts/test-claude-cli.ts <email>");
    process.exit(1);
}

const accounts = getAccounts();
const account = accounts.find(a => a.email === email);

if (!account) {
    console.error(`Account ${email} not found in antigravity-accounts.json`);
    process.exit(1);
}

console.log(`Testing Claude on CLI endpoint with account: ${account.email}`);

const openaiBody = {
    model: "claude-opus-4-5-thinking",
    messages: [
        { role: "user", content: "Hello, explain quantum physics in one sentence." }
    ],
    temperature: 0.7,
    max_tokens: 100
};

// Transform for CLI
const googleBody = transformToGoogleBody(openaiBody, account.projectId || "rising-fact-p41fc", true, "us-central1");
console.log("Transformed Body:", JSON.stringify(googleBody, null, 2));

const GOOGLE_URL = `https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse`;

const headers = getGeminiCliHeaders(account.accessToken!);

try {
    const res = await fetch(GOOGLE_URL, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(googleBody)
    });

    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log("Response:", text.substring(0, 500) + "...");
} catch (e) {
    console.error("Error:", e);
}
