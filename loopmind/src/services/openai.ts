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

async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tryOpenAI(facts: string): Promise<string | null> {
  if (!isOpenAIConfigured) return null;
  try {
    const res = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
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
      },
      15000,
    );
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.choices?.[0]?.message?.content as string | undefined)?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Free, keyless LLM (Pollinations). Uses the GET endpoint with a `referrer`,
 * which works from browsers (the POST endpoint is gated by Cloudflare Turnstile
 * for browser traffic). Returns plain text.
 */
async function tryPollinations(facts: string): Promise<string | null> {
  try {
    const prompt = `${SYSTEM_PROMPT}\n\nSHOT FACTS:\n${facts}\n\nNow give the caddie's spoken advice.`;
    const url = `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai&referrer=loopmind`;
    const res = await fetchWithTimeout(url, { method: "GET" }, 20000);
    if (!res.ok) return null;
    const text = (await res.text())?.trim();
    if (!text || text.length < 8) return null;
    if (text.startsWith("{") || text.startsWith("<") || /^\s*(error|forbidden)/i.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

export async function rewriteAsCaddie(facts: string): Promise<string | null> {
  const viaOpenAI = await tryOpenAI(facts);
  if (viaOpenAI) return viaOpenAI;
  return tryPollinations(facts);
}
