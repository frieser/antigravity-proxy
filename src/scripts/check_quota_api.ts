import { readFileSync } from "fs";
import { join } from "path";
import { getImpersonationHeaders } from "../utils/headers";

// Usage: bun run src/scripts/check_quota_api.ts <email>

const email = process.argv[2];
if (!email) {
    console.error("Usage: bun run src/scripts/check_quota_api.ts <email>");
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

console.log(`\n=== CHECKING QUOTA API FOR: ${account.email} ===`);
console.log(`Project ID: ${account.projectId}`);

// 2. Fetch Available Models (Quota)
const url = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";

try {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            ...getImpersonationHeaders(account.accessToken),
            "User-Agent": "antigravity", 
        },
        body: JSON.stringify({
            project: account.projectId
        })
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    const data = await res.json() as any;
    
    // 3. Print Raw Data
    console.log("\n--- RAW RESPONSE ---");
    console.log(JSON.stringify(data, null, 2));

    // 4. Analyze specifically for Claude/Antigravity
    console.log("\n--- ANALYSIS ---");
    const rawModels = data.availableModels || data.models || [];
    let found = false;
    for (const m of (Object.values(rawModels) as any[])) {
        const label = m.displayMetadata?.label || m.displayName || m.model?.name || "Unknown";
        console.log(`- Label: ${label}`);
        console.log(`  Model Struct: ${JSON.stringify(m.model)}`);
        console.log(`  Metadata: ${JSON.stringify(m.displayMetadata)}`);
    }
    if (!found) console.log("No Antigravity/Claude specific quota info found in response.");

} catch (e: any) {
    console.error(`EXCEPTION: ${e.message}`);
}
