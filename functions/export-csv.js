// CSV export logic
export async function onRequestGet({ env }) {
  const today = new Date().toISOString().slice(0, 10);
  const csv = `Date,Requests,Characters\n${today},0,0\n`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="usage-${today}.csv"`
    }
  });
}
