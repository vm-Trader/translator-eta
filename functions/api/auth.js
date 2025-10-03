// Auth + quota logic
export async function onRequestPost({ request, env }) {
  return new Response(JSON.stringify({ ok: true, msg: "Auth endpoint working" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
