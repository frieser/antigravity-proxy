// Map<conversation_id + thought_text_hash, signature>
const signatureCache = new Map<string, string>();

export function cacheSignature(conversationId: string, thought: string, signature: string) {
  const key = `${conversationId}:${Bun.hash(thought)}`; 
  signatureCache.set(key, signature);
  
  // LRU cleanup if too big (simplified)
  if (signatureCache.size > 1000) {
    const first = signatureCache.keys().next().value;
    if (first) signatureCache.delete(first);
  }
}

export function getSignature(conversationId: string, thought: string): string | undefined {
  const key = `${conversationId}:${Bun.hash(thought)}`;
  return signatureCache.get(key);
}
