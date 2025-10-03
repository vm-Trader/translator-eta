// Dashboard logic
export async function onRequestGet({ env }) {
  const today = new Date().toISOString().slice(0, 10);
  return new Response(`<h1>Dashboard – ${today}</h1>`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
