const IBAN = "IT60 X0542 8111 0100 0001 2345 6";
const INTESTATARIO = "VolantiniPro Srl";

Deno.serve(async (req) => {
  try {
    const { cliente, campagna, type = "conferma" } = await req.json();
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM_EMAIL");
    if (!resendKey || !from) return new Response("Resend not configured", { status: 200 });

    const isPaid = type === "pagamento_ricevuto";
    const html = isPaid ? `
      <h1>Pagamento ricevuto</h1>
      <p>Ciao ${cliente?.nome || cliente?.email || "Cliente"},</p>
      <p>Abbiamo ricevuto il pagamento per la tua campagna <strong>${campagna?.servizio}</strong> · <strong>${campagna?.zona}</strong>.</p>
      <p>La distribuzione inizierà entro 24 ore come concordato.</p>
      <p><a href="${campagna?.dashboard_url || "#"}">Vai alla dashboard</a></p>
      <p>Il team VolantiniPro</p>
    ` : `
      <h1>Campagna confermata — VolantiniPro</h1>
      <p>Ciao ${cliente?.nome || cliente?.email || "Cliente"},</p>
      <p>La tua campagna <strong>${campagna?.servizio}</strong> per la zona <strong>${campagna?.zona}</strong> è stata confermata.</p>
      <h2>Istruzioni per il pagamento</h2>
      <table>
        <tr><td>Intestatario</td><td><strong>${INTESTATARIO}</strong></td></tr>
        <tr><td>IBAN</td><td><strong>${IBAN}</strong></td></tr>
        <tr><td>Importo</td><td><strong>€${campagna?.totale_euro}</strong></td></tr>
        <tr><td>Causale</td><td><strong>${campagna?.causale_bonifico}</strong></td></tr>
      </table>
      <p>Inserire la causale ESATTA per il corretto abbinamento.</p>
      <p>La distribuzione partirà entro 24h dalla ricezione del pagamento.</p>
      <p>Il team VolantiniPro</p>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: cliente?.email,
        subject: isPaid ? "Pagamento ricevuto — La distribuzione inizia presto!" : `Conferma campagna ${campagna?.servizio} — Istruzioni pagamento`,
        html,
      }),
    });
    return new Response(await res.text(), { status: res.status });
  } catch (error) {
    return new Response(String(error), { status: 500 });
  }
});
