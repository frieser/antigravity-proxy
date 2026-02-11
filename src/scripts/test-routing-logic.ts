
import { transformToGoogleBody } from "../utils/transform";

const testCases = [
    {
        name: "Gemini 3 Flash (CLI)",
        input: {
            model: "antigravity-gemini-3-flash",
            messages: [{ role: "user", content: "Hi" }]
        },
        projectId: "test-project",
        isCli: true
    },
    {
        name: "Claude Opus Thinking (CLI)",
        input: {
            model: "antigravity-claude-opus-4-6-thinking-high",
            messages: [{ role: "user", content: "Hi" }]
        },
        projectId: "test-project",
        isCli: true
    }
];

console.log("--- STARTING ROUTING TESTS ---");

for (const test of testCases) {
    console.log(`\nTesting: ${test.name}`);
    const result = transformToGoogleBody(test.input, test.projectId, test.isCli, "us-central1");
    console.log(`Final Google Model: ${result.model}`);
    
    // Check for double suffixes or weird transformations
    if (result.model.endsWith("-preview-preview")) {
        console.log("FAIL: Double suffix detected!");
    } else if (result.model.includes("gemini-3") && test.isCli) {
        console.log("FAIL: Gemini 3 model name leaked to CLI (should be mapped to 2.0 or valid preview)");
    } else {
        console.log("OK: Model name looks valid (sanitized/mapped)");
    }
}
