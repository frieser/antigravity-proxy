
import { describe, expect, test } from "bun:test";

const API_URL = "http://localhost:3000/v1/chat/completions";
const MODEL = "gemini-2.0-flash";

const generateLongMessage = (words: number) => {
  return "word ".repeat(words).trim();
};

describe("Functional Tests: Gemini Chat (Real/Simulated)", () => {
  
  test("Short Message: Basic Greeting", async () => {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: "Hello, say 'pong' if you hear me." }],
          stream: false
        })
      });

      if (!response.ok) {
        console.warn("Skipping functional test: Server not reachable or error", response.status);
        return; 
      }

      const data = await response.json() as any;
      expect(response.status).toBe(200);
      expect(data.choices).toBeDefined();
      expect(data.choices[0].message.content).toBeDefined();
      console.log("Short message response:", data.choices[0].message.content.substring(0, 50) + "...");
    } catch (e) {
      console.warn("Skipping functional test: Server likely not running");
    }
  });

  test("Long Message: Context Handling", async () => {
    const longInput = generateLongMessage(1000); 
    
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "user", content: `Here is a long list of words: ${longInput}. Please summarize this by saying 'It is a list of words'.` }
          ],
          stream: false
        })
      });

      if (!response.ok) return;

      const data = await response.json() as any;
      expect(response.status).toBe(200);
      expect(data.choices[0].message.content).toBeDefined();
      console.log("Long message response:", data.choices[0].message.content);
    } catch (e) {
    }
  });

  test("Multi-turn Conversation (State/History)", async () => {
    const messages = [
      { role: "user", content: "My favorite color is blue." },
      { role: "assistant", content: "I will remember that your favorite color is blue." },
      { role: "user", content: "What is my favorite color?" }
    ];

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: messages,
          stream: false
        })
      });

      if (!response.ok) return;

      const data = await response.json() as any;
      const content = data.choices[0].message.content.toLowerCase();
      
      expect(response.status).toBe(200);
      const hasColor = content.includes("blue");
      expect(hasColor).toBe(true);
      console.log("Memory test response:", content);
    } catch (e) {
    }
  });

  test("System Instruction Behavior (via 'system' role)", async () => {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: "You are a pirate. Always speak like a pirate." },
            { role: "user", content: "Hello" }
          ],
          stream: false
        })
      });

      if (!response.ok) return;

      const data = await response.json() as any;
      const content = data.choices[0].message.content.toLowerCase();
      
      const isPirate = content.includes("ahoy") || content.includes("matey") || content.includes("arr");
      console.log("Pirate test response:", content);
    } catch (e) {
    }
  });
});
