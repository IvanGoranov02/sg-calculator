/**
 * Shared Google Gemini REST calls (same env as /api/dividend-insight).
 */

export function getGeminiApiKey(): string | null {
  const k = process.env.GEMINI_API_KEY?.trim();
  return k || null;
}

export function defaultGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
}

export type GeminiTextResult =
  | { ok: true; text: string }
  | { ok: false; error: "no_key" | "http" | "empty" | "network"; status?: number };

export async function geminiGenerateText(input: {
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<GeminiTextResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { ok: false, error: "no_key" };

  const model = defaultGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: input.prompt }] }],
        generationConfig: {
          maxOutputTokens: input.maxOutputTokens ?? 1024,
          temperature: input.temperature ?? 0.35,
        },
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
    });
  } catch {
    return { ok: false, error: "network" };
  }

  if (!res.ok) {
    return { ok: false, error: "http", status: res.status };
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")?.trim() ?? "";
  if (!text) return { ok: false, error: "empty" };
  return { ok: true, text };
}
