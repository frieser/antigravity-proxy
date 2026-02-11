import { initManager, getAccounts } from "../auth/manager";
import { getGeminiCliHeaders } from "../utils/headers";

console.log("Initializing...");
await initManager();
const accounts = getAccounts();
const account = accounts.find(a => a.email === "frieserpaldi@gmail.com");

if (!account || !account.accessToken) {
    console.error("Account not found");
    process.exit(1);
}

const url = "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse";
const baseBody = {
    project: account.projectId,
    requestType: "IDE_CHAT",
    request: {
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        generationConfig: { candidateCount: 1 }
    }
};

const modelsToTest = [
    "gemini-2.5-pro",
    "claude-sonnet-4-5",
    "claude-opus-4-6-thinking"
];

for (const m of modelsToTest) {
    console.log(`\nTesting model: '${m}'`);
    const body = { ...baseBody, model: m };
    
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: getGeminiCliHeaders(account.accessToken),
            body: JSON.stringify(body)
        });
        
        console.log(`Status: ${res.status}`);
        if (!res.ok) {
            console.log("Error:", (await res.text()).substring(0, 200));
        } else {
            console.log("Success!");
            await res.text(); 
        }
    } catch (e) {
        console.error(e);
    }
}
