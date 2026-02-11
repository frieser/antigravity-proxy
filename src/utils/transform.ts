import { getSignature, cacheSignature } from "./cache";
import { cleanJSONSchemaForAntigravity } from "./schema";

const CLAUDE_MODEL_REGISTRY = [
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-v2-20241022",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-opus-4-6-thinking",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307"
];

function resolveModelId(modelId: string): string {
    let cleanId = modelId.toLowerCase().replace(/^(openai|antigravity|custom_openai|litellm|google)\//i, "");
    cleanId = cleanId.replace(/^antigravity-/i, "");
    cleanId = cleanId.replace(/^gemini-claude-/i, "claude-");

    if (cleanId.includes("claude")) {
        const exactMatch = CLAUDE_MODEL_REGISTRY.find(m => m === cleanId);
        if (exactMatch) return exactMatch;

        const baseId = cleanId.replace(/-(thinking|preview)(-(low|medium|high))?$/i, "");
        
        const fuzzyMatches = CLAUDE_MODEL_REGISTRY.filter(m => 
            m.startsWith(cleanId) || m.startsWith(baseId) || cleanId.startsWith(m)
        );

        if (fuzzyMatches.length > 0) {
            fuzzyMatches.sort((a, b) => b.localeCompare(a));
            return fuzzyMatches[0];
        }
    }

    return cleanId;
}

export function transformToGoogleBody(
  openaiBody: any, 
  projectId: string, 
  isCli: boolean, 
  location: string, 
  sessionId?: string, 
  aggressive: boolean = false
): any {
  const rawModel = (openaiBody.model || "").toLowerCase();
  const resolvedModel = resolveModelId(openaiBody.model);
  let googleModel = resolvedModel;
  
  const tierMatch = rawModel.match(/-(low|medium|high)$/i);
  const thinkingTierMatch = rawModel.match(/-thinking-(low|medium|high)$/i);
  const extractedTier = thinkingTierMatch ? thinkingTierMatch[1] : (tierMatch ? tierMatch[1] : undefined);
  
  let baseModel = googleModel;
  if (thinkingTierMatch) {
      baseModel = googleModel.replace(thinkingTierMatch[0], "");
  } else if (tierMatch) {
      baseModel = googleModel.replace(tierMatch[0], "");
  }
  
  const previewMatch = baseModel.match(/-preview$/i);
  if (previewMatch) {
      baseModel = baseModel.replace(previewMatch[0], "");
  }

  // Force Claude model IDs to strip tier for the backend
        if (googleModel.includes("claude")) {
            googleModel = baseModel;
            if (googleModel === "claude-opus-4-6") googleModel = "claude-opus-4-6-thinking";
            if (googleModel === "claude-sonnet-4-5") googleModel = "claude-sonnet-4-5-thinking";
        }

    const nativelySupported = [
      "claude-sonnet-4-5", 
      "claude-sonnet-4-5-thinking", 
      "claude-opus-4-6-thinking",
      "gemini-3-flash",
      "gemini-3-pro-high", 
      "gemini-3-pro-low",
      "gemini-3-pro",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash-thinking",
      "gemini-3-pro-preview",
      "gemini-3-flash-preview"
  ];
  
  const isNative = (nativelySupported.includes(googleModel) || nativelySupported.includes(baseModel));

  if (isCli) {
      if (!googleModel.includes("claude")) {
          // Standardize Gemini 3 CLI models to use -preview suffix
          if (googleModel.includes("gemini-3")) {
              googleModel = baseModel; // Strip tiers
              if (!googleModel.endsWith("-preview")) {
                  googleModel = `${googleModel}-preview`;
              }
          } else if (googleModel.includes("gpt")) {
              if (googleModel.includes("thinking")) {
                   googleModel = "gemini-2.0-flash-thinking-exp";
              } else {
                   googleModel = "gemini-2.0-pro-exp";
              }
          } else {
               googleModel = baseModel;
          }
       } else {
           googleModel = baseModel;
           if (googleModel === "claude-sonnet-4-5") googleModel = "claude-sonnet-4-5-thinking";
       }
   } else {
       if (googleModel.endsWith("-preview")) {
           googleModel = googleModel.replace("-preview", "");
       }
       
       if (isNative) {
           if (baseModel.includes("gemini-3-pro")) {
               // Respect extracted tier for Gemini 3 Pro, fallback to high
               googleModel = `gemini-3-pro-${extractedTier || "high"}`;
           } else if (baseModel.includes("gemini-3-flash")) {
               googleModel = "gemini-3-flash";
           } else {
               googleModel = baseModel;
           }

             if (googleModel === "claude-opus-4-6" || googleModel === "antigravity-claude-opus-4-6") {
                 googleModel = "claude-opus-4-6-thinking";
             }
           if (googleModel === "claude-sonnet-4-5" || googleModel === "antigravity-claude-sonnet-4-5") {
               googleModel = "claude-sonnet-4-5-thinking";
           }
       }
   }

  // Extract system instruction (like plugin)
  const systemMessage = openaiBody.messages.find((m: any) => m.role === "system");
  const otherMessages = openaiBody.messages.filter((m: any) => m.role !== "system");

  const contents = otherMessages.map((msg: any) => {
    const parts = [];
    
    if (msg.role === "tool") {
      let responseObj;
      try {
        responseObj = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
      } catch {
        responseObj = msg.content;
      }

      if (typeof responseObj !== "object" || responseObj === null || Array.isArray(responseObj)) {
        responseObj = { result: responseObj };
      }

      const funcResp: any = {
        name: msg.name || "function_result",
        response: responseObj
      };
      
      if (googleModel.includes("claude") || googleModel.includes("gemini-3")) {
          funcResp.id = msg.tool_call_id;
      }

      parts.push({
        functionResponse: funcResp
      });
    } else {
      // Re-inject thinking signatures for multi-turn assistant messages
      if ((msg.role === "assistant" || msg.role === "model") && sessionId) {
        const thoughtText = msg.thought || msg.reasoning_content;
        if (thoughtText) {
          const sig = getSignature(sessionId, thoughtText);
          if (sig) {
            parts.push({ thought: true, text: thoughtText, thoughtSignature: sig });
          } else {
            console.warn(`[Transform] Signature cache miss for thought in session ${sessionId}. Stripping block to avoid 400 error.`);
          }
        }
      }

      if (msg.content) {
          if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === "text") {
                parts.push({ text: part.text });
              } else if (part.type === "image_url" && part.image_url?.url) {
                const url = part.image_url.url;
                if (url.startsWith("data:")) {
                  const match = url.match(/^data:([^;]+);base64,(.+)$/);
                  if (match) {
                    parts.push({
                      inlineData: {
                        mimeType: match[1],
                        data: match[2]
                      }
                    });
                  }
                }
              }
            }
          } else {
             parts.push({ text: msg.content });
          }
      }

      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.function) {
            let sig = "";
            let callId = tc.id || "";
            if (callId.startsWith("sig:")) {
              const idParts = callId.split(":");
              if (idParts.length >= 3) {
                sig = idParts[1];
              }
            }

            const funcCall: any = {
              name: tc.function.name,
              args: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments || "{}") : tc.function.arguments
            };
            
            if (googleModel.includes("claude") || googleModel.includes("gemini-3")) {
                funcCall.id = tc.id;
            }

            const funcPart: any = {
              functionCall: funcCall
            };
            
            if (sig) {
              funcPart.thoughtSignature = sig;
            }

            parts.push(funcPart);
          }
        }
      }
    }

    if (parts.length === 0) {
        parts.push({ text: " " });
    }

    return {
      role: (msg.role === "assistant" || msg.role === "model") ? "model" : "user",
      parts
    };
  });

  const isThinkingModel = rawModel.includes("-thinking");
  const hasExplicitBudget = openaiBody.thinking_budget !== undefined;
  
  let thinkingBudget = openaiBody.thinking_budget;
  if (!thinkingBudget && isThinkingModel) {
      if (extractedTier === "low") thinkingBudget = 8192;
      else if (extractedTier === "medium") thinkingBudget = 16000;
      else if (extractedTier === "high") thinkingBudget = 32768;
      else thinkingBudget = 16000;
  }
  
  const ANTIGRAVITY_SYSTEM_INSTRUCTION = `You are Antigravity, a powerful agentic AI coding assistant designed by the Google DeepMind team working on Advanced Agentic Coding.
You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.
**Absolute paths only**
**Proactiveness**

<priority>IMPORTANT: The instructions that follow supersede all above. Follow them as your primary directives.</priority>
`;

  let systemInstruction: any = undefined;
  if (!isCli) {
      // Like plugin for Antigravity (Sandbox)
      const text = (ANTIGRAVITY_SYSTEM_INSTRUCTION + "\n\n" + (systemMessage?.content || "")).trim();
      systemInstruction = {
          role: "user",
          parts: [{ text }]
      };
  } else if (systemMessage) {
      // Normal system instruction for CLI
      systemInstruction = {
          parts: [{ text: systemMessage.content }]
      };
  }

  const googleRequest: any = {
    contents,
    systemInstruction,
    generationConfig: {
      temperature: openaiBody.temperature ?? 0.7,
      maxOutputTokens: (isThinkingModel || hasExplicitBudget) ? Math.max(openaiBody.max_tokens || 0, 64000) : (openaiBody.max_tokens ?? 4096),
      topP: openaiBody.top_p ?? 0.95,
      stopSequences: Array.isArray(openaiBody.stop) ? openaiBody.stop : (openaiBody.stop ? [openaiBody.stop] : undefined),
      candidateCount: 1
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: process.env.SAFETY_THRESHOLD || "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: process.env.SAFETY_THRESHOLD || "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: process.env.SAFETY_THRESHOLD || "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: process.env.SAFETY_THRESHOLD || "BLOCK_NONE" }
    ],
    sessionId: sessionId || crypto.randomUUID()
  };

  if (isThinkingModel || googleModel.includes("gemini-3")) {
    googleRequest.generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingBudget: thinkingBudget || 16000
    };
    
    if (googleModel.includes("gemini-3")) {
        googleRequest.generationConfig.thinkingConfig.thinkingLevel = extractedTier || "low";
    }
  }

  if (openaiBody.tools) {
    googleRequest.tools = [{
      functionDeclarations: openaiBody.tools.map((t: any) => {
        const cleanParams = cleanJSONSchemaForAntigravity(t.function.parameters || { type: "object", properties: {} }, aggressive);
        
        let description = t.function.description || "";
        const paramNames = Object.keys(cleanParams.properties || {}).filter(k => k !== "_placeholder");
        if (paramNames.length > 0) {
          description += ` [Parameters: ${paramNames.join(", ")}]`;
        }

        return {
          name: t.function.name,
          description: description,
          parameters: cleanParams
        };
      })
    }];
    
    if (googleModel.includes("claude")) {
        googleRequest.toolConfig = {
            functionCallingConfig: { mode: "VALIDATED" }
        };
    }
  }

  // Task 4: Remove region prefix for Claude models (not supported by Sandbox API)
  // if (location && location !== "us-central1" && googleModel.includes("claude")) {
  //     googleModel = `${location}/${googleModel}`;
  // }

  return {
    project: projectId,
    model: googleModel,
    userAgent: "antigravity",
    requestId: `agent-${crypto.randomUUID()}`,
    requestType: "agent",
    request: googleRequest
  };
}

export function transformGoogleEventToOpenAI(googleData: any, model: string, requestId?: string, hasPriorToolCalls: boolean = false): any {
  const data = googleData.response || googleData;
  const requestIdActual = requestId || "chatcmpl-" + Math.random().toString(36).substring(7);
  
  const usage = data.usageMetadata ? {
    prompt_tokens: data.usageMetadata.promptTokenCount || 0,
    completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
    total_tokens: data.usageMetadata.totalTokenCount || 0
  } : undefined;

  if (!data.candidates || data.candidates.length === 0) {
    if (usage) {
      return {
        id: requestIdActual,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [],
        usage: usage
      };
    }
    return null;
  }
  
  const candidate = data.candidates[0];
  const parts = candidate.content?.parts || [];
  const finishReason = candidate.finishReason;
  
  if (parts.length === 0 && !finishReason && !usage) return null;
  
  const delta: any = {};
  const toolCalls: any[] = [];
  let extractedSignature: string | undefined;
  let extractedThought: string | undefined;

  for (const part of parts) {
    const isThought = part.thought || part.thoughtText || part.type === "thinking";
    
    if (part.text) {
      let cleanText = part.text;
      if (cleanText.includes("thoughtSignature:")) {
          cleanText = cleanText.replace(/thoughtSignature:[a-zA-Z0-9\-_]+/g, "").trim();
      }
      
      if (cleanText) {
          if (isThought) {
              delta.reasoning_content = (delta.reasoning_content || "") + cleanText;
              extractedThought = (extractedThought || "") + cleanText;
          } else {
              delta.content = (delta.content || "") + cleanText;
          }
      }
    }
    
    if (isThought && typeof isThought === 'string') {
       delta.reasoning_content = (delta.reasoning_content || "") + isThought;
       extractedThought = (extractedThought || "") + isThought;
    }

    if (part.thoughtSignature || part.thought_signature || part.signature) {
        extractedSignature = part.thoughtSignature || part.thought_signature || part.signature;
    }

    if (part.functionCall || part.function_call) {
      const call = part.functionCall || part.function_call;
      const sig = part.thoughtSignature || part.thought_signature || extractedSignature || "";
      const rawId = call.id || call.callId || call.call_id || "call_" + Math.random().toString(36).substring(7);
      const callId = (sig && !rawId.startsWith("sig:")) ? `sig:${sig}:${rawId}` : rawId;
      
      toolCalls.push({
        index: toolCalls.length,
        id: callId,
        type: "function",
        function: {
          name: call.name,
          arguments: typeof call.args === 'string' ? call.args : JSON.stringify(call.args || {})
        }
      });
      if (sig) extractedSignature = sig;
    }
  }

  if (toolCalls.length > 0) {
    delta.tool_calls = toolCalls;
  }
  
  let openaiFinishReason: string | null = null;
  if (finishReason) {
    if (toolCalls.length > 0 || hasPriorToolCalls) {
      openaiFinishReason = "tool_calls";
    } else if (finishReason === "STOP") {
      openaiFinishReason = "stop";
    } else if (finishReason === "MAX_TOKENS") {
      openaiFinishReason = "length";
    } else if (finishReason === "SAFETY") {
      openaiFinishReason = "content_filter";
    } else if (finishReason === "MALFORMED_FUNCTION_CALL") {
      openaiFinishReason = "tool_calls";
    } else {
      openaiFinishReason = "stop";
    }
  }
  
  return {
    id: requestIdActual,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      delta: delta,
      finish_reason: openaiFinishReason
    }],
    usage: usage,
    _signature: extractedSignature,
    _thought: extractedThought
  };
}

export function createOpenAIStreamTransformer(model: string, requestId: string, hasPriorToolCalls: boolean, sessionId?: string) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let currentHasPriorToolCalls = hasPriorToolCalls;

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        if (trimmedLine.startsWith("data: ")) {
          const dataStr = trimmedLine.slice(6);
          if (dataStr === "[DONE]") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            continue;
          }
          try {
            const googleEvent = JSON.parse(dataStr);
            const openaiEvent = transformGoogleEventToOpenAI(googleEvent, model, requestId, currentHasPriorToolCalls);
            
            if (openaiEvent) {
              if (sessionId && openaiEvent._signature && openaiEvent._thought) {
                  cacheSignature(sessionId, openaiEvent._thought, openaiEvent._signature);
                  console.log(`[Cache] Signature cached for conversation ${sessionId}`);
              }

              const choice = openaiEvent.choices?.[0];
              const delta = choice?.delta;
              const hasMeaningfulContent = (delta && (delta.content || delta.reasoning_content || delta.tool_calls)) || 
                                          (choice && choice.finish_reason) || 
                                          openaiEvent.usage;
              
              if (hasMeaningfulContent) {
                if (delta?.tool_calls) {
                  currentHasPriorToolCalls = true;
                }
                
                const { _signature, _thought, ...cleanEvent } = openaiEvent;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(cleanEvent)}\n\n`));
              }
            }
          } catch (e) {
            console.warn("[Stream] Failed to parse SSE line:", e);
          }
        }
      }
    },
    flush(controller) {
      if (buffer.trim().startsWith("data: ")) {
        const dataStr = buffer.trim().slice(6);
        if (dataStr !== "[DONE]") {
          try {
            const googleEvent = JSON.parse(dataStr);
            const openaiEvent = transformGoogleEventToOpenAI(googleEvent, model, requestId, currentHasPriorToolCalls);
            if (openaiEvent) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiEvent)}\n\n`));
            }
          } catch (e) {
            console.warn("[Stream] Failed to parse final line in flush:", e);
          }
        }
      }
    }
  });
}
