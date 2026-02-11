
async function testClaude() {
  const modelName = "antigravity-claude-opus-4-6-thinking-high";
  const email = "frieserpaldi@gmail.com";
  
  console.log(`\n🚀 Testing ${modelName} with forced account: ${email}`);
  
  while (true) {
      try {
        const response = await fetch("http://127.0.0.1:3000/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer sk-antigravity",
            "X-Antigravity-Account": email
          },
          body: JSON.stringify({
            model: modelName, 
            messages: [
                { role: "user", content: "Hello! Reply with 'OK' if you see this." }
            ],
            stream: false
          })
        });

        const status = response.status;
        const text = await response.text();
        
        console.log(`\n📡 Status Code: ${status}`);
        
        if (response.ok) {
            console.log("\n✅ SUCCESS: The request worked!");
            console.log(text);
            break;
        } else {
            console.log(`❌ FAILURE: ${text}`);
            if (status === 429) {
                 console.log("⏳ 429 received. Waiting 60 seconds...");
                 await new Promise(r => setTimeout(r, 60000));
            } else {
                 // Stop on non-quota errors to debug
                 break;
            }
        }

      } catch (e) {
          console.error("\n❌ NETWORK ERROR:", e);
          await new Promise(r => setTimeout(r, 5000));
      }
  }
}

testClaude();
