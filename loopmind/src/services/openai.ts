import { env, isOpenAIConfigured } from "@/lib/env";

/**
 * OpenAI explanation layer.
 *
 * The caddie's *decision* is always made by the deterministic rule engine
 * (`src/caddie/engine.ts`). OpenAI is only used to rewrite the supporting facts
 * into warm, human caddie language. When no key is configured this returns
 * `null` and the app uses the built-in template instead — so it always works.
 *
 * REAL AI: set `EXPO_PUBLIC_OPENAI_API_KEY`. For production, proxy this through
 * your own backend so the key is never shipped in the client bundle.
 */
const SYSTEM_PROMPT =
  "You are LoopMind, a calm, confident PGA Tour-level caddie with 1000 rounds of wisdom who still talks like a normal, encouraging person. " +
  "Given the facts of a golf shot and a recommended club, write 2-3 short sentences of advice. " +
  "Be clear and human, never robotic. Mention the number, the club, where to aim, and the smart miss. " +
  "Do not invent data you were not given. Do not use markdown.";

export async function rewriteAsCaddie(facts: string): Promise<string | null> {
  if (!isOpenAIConfigured) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 160,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: facts },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text: string | undefined = json?.choices?.[0]?.message?.content;
    return text?.trim() || null;
  } catch {
    return null;
  }
}
