import React, { useEffect, useState } from "react";
import { customerCreateModificationRequest, customerListModificationRequests } from "../../lib/services/hub-api.js";
import { PHOTO_REPORT_EXTRA, PHOTO_REPORT_PRICE, TRACKING_GPS_EXTRA, TRACKING_GPS_PRICE } from "../../lib/extraServicePrices.js";

const OFFERS = {
  tracking_gps: { label: TRACKING_GPS_EXTRA, price: TRACKING_GPS_PRICE, shows: "percorso degli operatori e mappa di copertura", cta: "Aggiungi Tracking GPS" },
  photo_report_advanced: { label: PHOTO_REPORT_EXTRA, price: PHOTO_REPORT_PRICE, shows: "foto con data, ora e posizione", cta: "Aggiungi Report fotografico" },
};
const TONES = {
  dark: { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)", title: "#F8FAFC", text: "rgba(255,255,255,.62)" },
  light: { background: "#fff", border: "1px solid #d7ded9", title: "#17211f", text: "#64748b" },
};

/** Area a pagamento non acquistata: il Cliente chiede l'aggiunta, l'Admin approva e attiva. */
export function ExtraNotIncludedCard({ campaignId, extraId, tone = "dark" }) {
  const offer = OFFERS[extraId];
  const colors = TONES[tone];
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    let cancelled = false;
    customerListModificationRequests(campaignId)
      .then((rows) => {
        const open = (rows || []).some((row) => row.type === "extra" && row.requested_value?.extra_id === extraId && row.status === "pending");
        if (!cancelled && open) setStatus("sent");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [campaignId, extraId]);

  const request = async () => {
    setStatus("sending");
    try {
      await customerCreateModificationRequest({
        campaignId,
        type: "extra",
        currentValue: {},
        requestedValue: { extra_id: extraId, label: offer.label, price: offer.price },
        note: `Aggiunta ${offer.label}`,
      });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div data-extra-locked={extraId} style={{ padding: 18, borderRadius: 12, background: colors.background, border: colors.border, fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 800, color: colors.title }}>Servizio non incluso in questa campagna</p>
      <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.55, color: colors.text }}>
        Con {offer.label} vedi {offer.shows}.
      </p>
      {status === "sent" ? (
        <p role="status" style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.55, color: colors.title }}>
          Richiesta inviata: il team la approva e attiva il servizio. Il pagamento viene concordato a parte.
        </p>
      ) : (
        <>
          <button type="button" onClick={request} disabled={status === "sending"} style={{ minHeight: 44, padding: "10px 18px", border: "none", borderRadius: 10, background: "#CE4B15", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 800, cursor: status === "sending" ? "default" : "pointer", opacity: status === "sending" ? 0.7 : 1 }}>
            {offer.cta}
          </button>
          {status === "error" && <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, color: tone === "dark" ? "#fca5a5" : "#991b1b" }}>Richiesta non inviata. Riprova.</p>}
        </>
      )}
    </div>
  );
}
