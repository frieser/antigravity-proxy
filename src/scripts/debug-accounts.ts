
import { file } from "bun";

async function main() {
    try {
        const path = "antigravity-accounts.json";
        const f = file(path);
        if (await f.exists()) {
            const data = await f.json();
            console.log("--- Account Project IDs ---");
            data.forEach((acc: any) => {
                console.log(`Email: ${acc.email}`);
                console.log(`ProjectId: ${acc.projectId || "MISSING (Will use fallback)"}`);
                console.log(`Health: ${acc.healthScore}`);
                console.log("---------------------------");
            });
        } else {
            console.log("No accounts file found.");
        }
    } catch (e) {
        console.error("Error reading accounts:", e);
    }
}

main();
