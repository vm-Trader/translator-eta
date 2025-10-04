// ======================================================================
//  Cloudflare Pages Function – Gemini ETA Translator
//  Route: /api/gemini
// ======================================================================
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin") || "";
  const host = request.headers.get("Host") || "";
  const allowOrigin =
    origin === `https://${host}` ||
    origin.endsWith(".translator-eta.pages.dev") ||
    origin === "https://translator-eta.pages.dev";

  const cors = {
    "Access-Control-Allow-Origin": allowOrigin ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
  const json = (body, init = {}) =>
    new Response(JSON.stringify(body), {
      ...init,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (request.method === "OPTIONS") return json(null, { status: 204 });
  if (request.method !== "POST")
    return json({ error: "Method Not Allowed" }, { status: 405 });

  const ct = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!ct.includes("application/json"))
    return json({ error: "Unsupported Media Type" }, { status: 415 });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON", message: e.message }, { status: 400 });
  }

  const rawText = (body?.text ?? "").toString().trim();
  const targetLang = (body?.target ?? "vi").toLowerCase().trim();
  const sourceLang = (body?.source ?? "auto").toLowerCase().trim();

  if (!rawText) return json({ error: "Missing text" }, { status: 400 });
  if (rawText.length > 2000)
    return json({ error: "Text too long" }, { status: 413 });

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "Server misconfigured" }, { status: 500 });

  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
  const now = new Date();
  const minuteKey = `ratelimit:${ip}:${now.toISOString().slice(0, 16)}`;
  const count = parseInt((await env.GEMINI_KV.get(minuteKey)) || "0");
  if (count >= 25)
    return json({ error: "Too many requests – slow down" }, { status: 429 });
  await env.GEMINI_KV.put(minuteKey, String(count + 1), { expirationTtl: 70 });

  // Logging counters
  const today = now.toISOString().slice(0, 10);
  await env.GEMINI_KV.put(`count:${today}`, String(
    parseInt((await env.GEMINI_KV.get(`count:${today}`)) || "0") + 1
  ), { expirationTtl: 90000 });
  await env.GEMINI_KV.put(`chars:${today}`, String(
    parseInt((await env.GEMINI_KV.get(`chars:${today}`)) || "0") + rawText.length
  ), { expirationTtl: 90000 });

  // Vietnamese-native system prompt
  const systemPrompt = `
You are a professional Vietnamese-English translator with cultural awareness.
- Detect the language if not provided.
- Polish grammar and clarity in source language.
- Translate into target language naturally.
- Vietnamese output must respect tone (e.g., "ạ", "ơi"), hierarchy (e.g., anh, chị, em), and indirect politeness.
- Avoid robotic literal translations. Embrace Vietnamese circular storytelling, face-saving expressions, and natural cadence.
Return only JSON:
{
  "inputLanguage": "<iso>",
  "improved": "<polished>",
  "translation": "<translated>"
}
`.trim();

  const prompt = `${systemPrompt}\n\nSOURCE: ${sourceLang}\nTARGET: ${targetLang}\n\nTEXT: "${rawText}"`;

  const MODELS = [
    "gemini-1.5-flash",
    "gemini-pro",
    "gemini-2.5-flash",
    "gemini-1.5-pro",
  ];

  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          inputLanguage: { type: "STRING" },
          improved: { type: "STRING" },
          translation: { type: "STRING" },
        },
        required: ["inputLanguage", "improved", "translation"],
      },
    },
  };

  async function tryModel(model) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`${model} failed: ${res.status}`);
      const json = await res.json();
      const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!txt) throw new Error(`${model} returned empty`);
      return JSON.parse(txt);
    } catch (err) {
      console.warn(`[${model}]`, err.message);
      return null;
    }
  }

  let result = null;
  for (const m of MODELS) {
    result = await tryModel(m);
    if (result) break;
  }

  if (!result) return json({ error: "All models failed" }, { status: 502 });

  return json({
    inputLanguage: result.inputLanguage || "unknown",
    improved: result.improved || "",
    translation: result.translation || "",
  });
}
