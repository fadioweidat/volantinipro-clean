export async function sendEmailConferma({ cliente, campagna, type = "conferma" }) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !cliente?.email) return { skipped: true };
  const endpoint = `${url}/functions/v1/send-email-conferma`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cliente, campagna, type }),
  });
  if (!response.ok) throw new Error("Email conferma non inviata");
  return response;
}
