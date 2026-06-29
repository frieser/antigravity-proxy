
import { describe, expect, test } from "bun:test";
import { transformToGoogleBody, transformGoogleEventToOpenAI, createOpenAIStreamTransformer, isUnsupportedAntigravityVersionText } from "../../src/utils/transform";
import { ANTIGRAVITY_VERSION } from "../../src/utils/headers";

describe("Unit Tests: transformToGoogleBody", () => {
  test("Basic message transformation", () => {
    const openaiBody = {
      model: "gpt-4o",
      messages: [
        { role: "user", content: "Hello Gemini" }
      ],
      temperature: 0.5
    };

    const result = transformToGoogleBody(openaiBody, "test-project", false, "us-central1");

    expect(result.project).toBe("test-project");
    expect(result.model).toBe("gpt-4o"); // It passes through if no antigravity prefix
    expect(result.request.contents).toHaveLength(1);
    expect(result.request.contents[0].role).toBe("user");
    expect(result.request.contents[0].parts[0].text).toBe("Hello Gemini");
    expect(result.request.generationConfig.temperature).toBe(0.5);
  });

  test("Antigravity model prefix removal", () => {
    const openaiBody = {
      model: "antigravity-gemini-2.0-flash",
      messages: [{ role: "user", content: "Hi" }]
    };

    const result = transformToGoogleBody(openaiBody, "p", false, "us-central1");
    expect(result.model).toBe("gemini-2.0-flash");
  });

  test("Versioned Antigravity user agent is sent in the request body", () => {
    const openaiBody = {
      model: "antigravity-gemini-3-flash",
      messages: [{ role: "user", content: "Hi" }]
    };

    const result = transformToGoogleBody(openaiBody, "p", false, "us-central1");
    expect(result.userAgent).toBe(`antigravity/${ANTIGRAVITY_VERSION}`);
  });

  test("Display model labels normalize to backend model IDs", () => {
    const openaiBody = {
      model: "Gemini 3 Flash",
      messages: [{ role: "user", content: "Hi" }]
    };

    const result = transformToGoogleBody(openaiBody, "p", false, "us-central1");
    expect(result.model).toBe("gemini-3-flash");
  });

  test("Thinking level extraction for CLI", () => {
    const openaiBody = {
      model: "gemini-3-flash-thinking-medium",
      messages: [{ role: "user", content: "Hi" }]
    };

    const result = transformToGoogleBody(openaiBody, "p", true, "us-central1"); // isCli = true
    expect(result.model).toBe("gemini-3-flash-preview");
    expect(result.request.generationConfig.thinkingConfig.thinkingLevel).toBe("medium");
  });

  test("Multi-turn conversation", () => {
    const openaiBody = {
      model: "gemini-1.5-pro",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" }
      ]
    };

    const result = transformToGoogleBody(openaiBody, "p", false, "us-central1");
    expect(result.request.contents).toHaveLength(3);
    expect(result.request.contents[0].role).toBe("user");
    expect(result.request.contents[1].role).toBe("model"); // OpenAI assistant -> Google model
    expect(result.request.contents[2].role).toBe("user");
  });

  test("Tool transformation", () => {
    const openaiBody = {
      model: "gemini-1.5-pro",
      messages: [{ role: "user", content: "Check weather" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string" }
              },
              required: ["location"]
            }
          }
        }
      ]
    };

    const result = transformToGoogleBody(openaiBody, "p", false, "us-central1");
    expect(result.request.tools).toBeDefined();
    expect(result.request.tools[0].functionDeclarations).toHaveLength(1);
    expect(result.request.tools[0].functionDeclarations[0].name).toBe("get_weather");
    expect(result.request.tools[0].functionDeclarations[0].parameters.properties.location).toBeDefined();
  });

  test("Claude Opus 4.6 Thinking mapping and budget", () => {
    const openaiBody = {
      model: "antigravity-claude-opus-4-6-thinking-high",
      messages: [{ role: "user", content: "Hi" }]
    };

    const result = transformToGoogleBody(openaiBody, "p", false, "us-central1");
    expect(result.model).toBe("claude-opus-4-6-thinking");
    expect(result.request.generationConfig.thinkingConfig.includeThoughts).toBe(true);
    expect(result.request.generationConfig.thinkingConfig.thinkingBudget).toBe(32768);
  });

  test("Claude Opus 4.6 Thinking Low budget", () => {
    const openaiBody = {
      model: "antigravity-claude-opus-4-6-thinking-low",
      messages: [{ role: "user", content: "Hi" }]
    };

    const result = transformToGoogleBody(openaiBody, "p", false, "us-central1");
    expect(result.request.generationConfig.thinkingConfig.thinkingBudget).toBe(8192);
  });

  test("Claude tool call transformation with ID", () => {
    const openaiBody = {
      model: "antigravity-claude-opus-4-6-thinking-high",
      messages: [
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_abc123",
              type: "function",
              function: { name: "test_tool", arguments: "{}" }
            }
          ]
        }
      ]
    };

    const result = transformToGoogleBody(openaiBody, "p", false, "us-central1");
    const funcCallPart = result.request.contents[0].parts.find((p: any) => p.functionCall);
    expect(funcCallPart).toBeDefined();
    expect(funcCallPart.functionCall.id).toBe("call_abc123");
  });

  test("Claude tool response transformation with ID", () => {
    const openaiBody = {
      model: "antigravity-claude-opus-4-6-thinking-high",
      messages: [
        {
          role: "tool",
          tool_call_id: "call_abc123",
          name: "test_tool",
          content: '{"result": "ok"}'
        }
      ]
    };

    const result = transformToGoogleBody(openaiBody, "p", false, "us-central1");
    const funcRespPart = result.request.contents[0].parts.find((p: any) => p.functionResponse);
    expect(funcRespPart).toBeDefined();
    expect(funcRespPart.functionResponse.id).toBe("call_abc123");
  });
});

describe("Unit Tests: transformGoogleEventToOpenAI", () => {
  test("Basic text response", () => {
    const googleData = {
      candidates: [{
        content: {
          parts: [{ text: "Hello world" }]
        },
        finishReason: "STOP"
      }]
    };

    const result = transformGoogleEventToOpenAI(googleData, "gemini-1.5-pro", "req-123");
    expect(result).not.toBeNull();
    expect(result.choices[0].delta.content).toBe("Hello world");
    expect(result.choices[0].finish_reason).toBe("stop");
  });

  test("Tool call response", () => {
    const googleData = {
      candidates: [{
        content: {
          parts: [{
            functionCall: {
              name: "get_weather",
              args: { location: "London" }
            }
          }]
        }
      }]
    };

    const result = transformGoogleEventToOpenAI(googleData, "gemini-1.5-pro");
    expect(result.choices[0].delta.tool_calls).toHaveLength(1);
    expect(result.choices[0].delta.tool_calls[0].function.name).toBe("get_weather");
    expect(JSON.parse(result.choices[0].delta.tool_calls[0].function.arguments).location).toBe("London");
  });

  test("Empty/Invalid response", () => {
    const googleData = { candidates: [] };
    const result = transformGoogleEventToOpenAI(googleData, "model");
    expect(result).toBeNull();
  });

  test("Unsupported Antigravity version sentinel is detected", () => {
    expect(isUnsupportedAntigravityVersionText("This version of Antigravity is no longer supported. Please upgrade to receive the latest features.")).toBe(true);
    expect(isUnsupportedAntigravityVersionText("normal model response")).toBe(false);
  });

  test("Streaming unsupported-version sentinel is emitted as an error event", async () => {
    const upstream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"This version of Antigravity is no longer supported. Please upgrade to receive the latest features."}]},"finishReason":"STOP"}]}\n\n'));
        controller.close();
      }
    });

    const transformed = upstream.pipeThrough(createOpenAIStreamTransformer("model", "req-123", false));
    const text = await new Response(transformed).text();

    expect(text).toContain('"code":"antigravity_version_unsupported"');
    expect(text).not.toContain('"delta":{"content":"This version of Antigravity is no longer supported');
  });
});
