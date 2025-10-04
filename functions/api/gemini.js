export async function onRequestPost({ request, env }) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: cors
    });
  }

  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) {
    return new Response(JSON.stringify({ error: "Unsupported Media Type" }), {
      status: 415,
      headers: cors
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON", message: err.message }), {
      status: 400,
      headers: cors
    });
  }

  const rawText = (body?.text || "").toString().trim();
  const targetLang = (body?.target || "vi").toLowerCase();
  const sourceLang = (body?.source || "auto").toLowerCase();

  if (!rawText) {
    return new Response(JSON.stringify({ error: "Missing input text" }), {
      status: 400,
      headers: cors
    });
  }

  if (rawText.length > 2000) {
    return new Response(JSON.stringify({ error: "Input too long" }), {
      status: 413,
      headers: cors
    });
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing API key" }), {
      status: 500,
      headers: cors
    });
  }

  const systemPrompt = `
You are an ETA (Easy Translate All) assistant.
Rules:
- Detect the input language (ISO-639-1) unless source is given.
- Polish grammar and style in the same language.
- Translate the polished text into the target language requested.
- Keep tone polite, natural, human-like.
- Return JSON only in format:
{
  "inputLanguage": "<iso>",
  "improved": "<polished same-language>",
  "translation": "<translated into target>"
}
`.trim();

  const prompt = `${systemPrompt}\n\nSOURCE: ${sourceLang}\nTARGET: ${targetLang}\n\nTEXT: "${rawText}"`;

  const MODELS = [
    "gemini-1.5-flash",
    "gemini-pro",
    "gemini-2.5-flash",
    "gemini-1.5-pro"
  ];

  async function tryModel(model) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                inputLanguage: { type: "STRING" },
                improved: { type: "STRING" },
                translation: { type: "STRING" }
              },
              required: ["inputLanguage", "improved", "translation"]
            }
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`${model} → HTTP ${response.status}`);
      const json = await response.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error(`${model} → Empty response`);
      return JSON.parse(text);
    } catch (err) {
      console.warn(`⚠️ ${model} failed: ${err.message}`);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  let result = null;
  for (const model of MODELS) {
    result = await tryModel(model);
    if (result) break;
  }

  if (!result) {
    return new Response(JSON.stringify({ error: "All Gemini models failed" }), {
      status: 502,
      headers: cors
    });
  }

  const safe = {
    inputLanguage: String(result.inputLanguage || "unknown"),
    improved: String(result.improved || ""),
    translation: String(result.translation || "")
  };

  return new Response(JSON.stringify(safe), {
    status: 200,
    headers: cors
  });
}
