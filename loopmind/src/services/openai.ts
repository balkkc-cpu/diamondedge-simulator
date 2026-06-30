import { env, isOpenAIConfigured } from "@/lib/env";

/**
 * AI caddie text generation.
 *
 * The caddie's *decision* is always made by the deterministic rule engine
 * (`src/caddie/engine.ts`). This layer turns the facts into warm, genuinely
 * generated caddie language so it never feels canned.
 *
 * Provider order:
 *   1. OpenAI — used when `EXPO_PUBLIC_OPENAI_API_KEY` is set (best quality).
 *   2. Pollinations — a FREE, keyless LLM endpoint, so every user gets real AI
 *      advice with no setup. (https://pollinations.ai)
 *   3. null — caller falls back to the personalized rule-based template.
 */
const SYSTEM_PROMPT =
  "You are an AI golf caddie. Speak in the given caddie persona's voice. " +
  "Given the facts of a golf shot and the recommended club, write 2-3 short, specific sentences of advice. " +
  "Be human, encouraging and concrete — reference the exact number, club, wind, where to aim and the smart miss. " +
  "Do not invent data you were not given. Vary your wording. No markdown, no lists.";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await p;
  } finally {
    clearTimeout(timer);
  }
}

async function tryOpenAI(facts: string): Promise<string | null> {
  if (!isOpenAIConfigured) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.openaiApiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 160,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: facts },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.choices?.[0]?.message?.content as string | undefined)?.trim() || null;
  } catch {
    return null;
  }
}

/** Free, keyless LLM (Pollinations). Returns plain text. */
async function tryPollinations(facts: string): Promise<string | null> {
  try {
    const res = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai",
        temperature: 0.8,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: facts },
        ],
      }),
    });
    if (!res.ok) return null;
    const text = (await res.text())?.trim();
    if (!text || text.length < 8) return null;
    // Guard against occasional error/JSON payloads.
    if (text.startsWith("{") || text.toLowerCase().includes("error")) return null;
    return text;
  } catch {
    return null;
  }
}

export async function rewriteAsCaddie(facts: string): Promise<string | null> {
  const viaOpenAI = await withTimeout(tryOpenAI(facts), 15000).catch(() => null);
  if (viaOpenAI) return viaOpenAI;
  return withTimeout(tryPollinations(facts), 18000).catch(() => null);
}
