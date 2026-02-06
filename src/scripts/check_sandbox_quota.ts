import { readFileSync } from "fs";
import { join } from "path";
import { getImpersonationHeaders } from "../utils/headers";

const email = process.argv[2];
if (!email) {
    console.error("Usage: bun run src/scripts/check_sandbox_quota.ts <email>");
    process.exit(1);
}

const dbPath = join(process.cwd(), "antigravity-accounts.json");
let json = JSON.parse(readFileSync(dbPath, "utf-8"));
let accounts = Array.isArray(json) ? json : (json.accounts || []);
const account = accounts.find((a: any) => a.email === email);
if (!account) {
    console.error(`Account ${email} not found.`);
    process.exit(1);
}

const url = "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels";

try {
    const res = await fetch(url, {
        method: "POST",
        headers: getImpersonationHeaders(account.accessToken),
        body: JSON.stringify({ project: account.projectId || "rising-fact-p41fc" })
    });

    console.log(`Status: ${res.status} ${res.statusText}`);
    const data = await res.json() as any;
    console.log("\n--- SANDBOX MODELS ---");
    const rawModels = data.availableModels || data.models || [];
    for (const m of (Object.values(rawModels) as any[])) {
        const label = m.displayMetadata?.label || m.displayName || m.model?.name || "Unknown";
        console.log(`- Label: ${label}`);
        console.log(`  Model ID: ${m.model?.name}`);
        console.log(`  Model Struct: ${JSON.stringify(m.model)}`);
        console.log(`  Metadata: ${JSON.stringify(m.displayMetadata)}`);
    }
} catch (e: any) {
    console.error(`EXCEPTION: ${e.message}`);
}
