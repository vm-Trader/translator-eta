// Gemini translator
export async function onRequestPost({ request, env }) {
  return new Response(JSON.stringify({
    inputLanguage: "en",
    improved: "This is a stub",
    translation: "Đây là bản thử nghiệm"
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
