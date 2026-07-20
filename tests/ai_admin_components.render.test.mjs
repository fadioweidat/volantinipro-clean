import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
const ready = (data) => ({ status: "ready", data, observedAt: "2026-07-20T11:55:00Z", staleAfterMs: 600_000 });

try {
  const { AdminOperationalBrief } = await vite.ssrLoadModule("/src/components/ai/admin/AdminOperationalBrief.jsx");
  const { buildAdminDashboardInsights } = await vite.ssrLoadModule("/src/lib/ai/buildAdminInsights.js");
  const now = new Date("2026-07-20T12:00:00Z");
  const sources = { campaigns: ready([{}]), sessions: ready([{}]), gpsPoints: ready([{}]), proofPhotos: ready(null), waitlist: ready([{}]), activities: ready([{}]) };
  const snapshot = { activeCampaigns: 3, completedCampaigns: 2, lateCampaigns: 1, liveSessions: 4, operatorStatus: "5/2", onlineOperators: 5, offlineOperators: 2, pendingCampaigns: 1, activeClients: 4, pendingRequests: 2, totalRevenue: 1520.5, avgCpm: 48.25, alarmCount: 6, opsProblems: 3, lastUpdate: "2026-07-20T11:55:00Z" };
  const result = buildAdminDashboardInsights({ sources, snapshot, now });
  const links = [{ href: "/admin/live", label: "Monitor GPS Live", description: "Sessioni e tracker" }, { href: "/admin/anomalie", label: "Anomalie esistenti", description: "Controlli correnti" }];

  test("brief Admin rende KPI contrattuali e Copilota guidato", () => {
    const html = renderToStaticMarkup(React.createElement(AdminOperationalBrief, { items: result.items, attention: result.attention, attentionState: result.attentionState, links }));
    assert.equal((html.match(/DATO DERIVATO/g) || []).length >= 12, true);
    assert.match(html, /Copilota Operativo AI/);
    assert.match(html, /Nessuna chat libera/);
    assert.doesNotMatch(html, /<textarea/);
    assert.match(html, /Fonte e criterio/);
  });

  test("anomalie spiegate mantengono link a sole route esistenti", () => {
    const html = renderToStaticMarkup(React.createElement(AdminOperationalBrief, { items: result.items, attention: result.attention, attentionState: result.attentionState, links }));
    assert.match(html, /Anomalie gia rilevate/);
    assert.match(html, /problemi operativi sono gia associati/);
    assert.match(html, /href="\/admin\/anomalie"/);
    assert.match(html, /href="\/admin\/live"/);
    assert.doesNotMatch(html, /Routing intelligente|Assegna operatore|Applica priorità/i);
  });

  test("brief Admin espone loading, vuoto ed errore senza conclusioni", () => {
    const loading = renderToStaticMarkup(React.createElement(AdminOperationalBrief, { loading: true }));
    const empty = renderToStaticMarkup(React.createElement(AdminOperationalBrief, { items: [] }));
    const error = renderToStaticMarkup(React.createElement(AdminOperationalBrief, { error: "Errore controllato" }));
    assert.match(loading, /Caricamento KPI Admin/);
    assert.match(loading, /Nessuna conclusione generata/);
    assert.match(empty, /Nessun KPI disponibile/);
    assert.match(error, /Dati operativi non caricati/);
    assert.match(error, /non produce conclusioni/);
  });

  test("brief Admin dichiara verifica parziale e valori non disponibili", () => {
    const partialResult = buildAdminDashboardInsights({ sources: { ...sources, proofPhotos: { status: "missing", reason: "Foto non disponibili." } }, snapshot, now });
    const html = renderToStaticMarkup(React.createElement(AdminOperationalBrief, { items: partialResult.items, attention: partialResult.attention, attentionState: partialResult.attentionState }));
    assert.match(html, /NON DISPONIBILE/);
    assert.match(html, /Verifica parziale/);
    assert.match(html, /nessun valore sostitutivo/);
  });

  test("brief Admin dichiara accesso negato senza mostrare il KPI protetto", () => {
    const deniedResult = buildAdminDashboardInsights({ sources: { ...sources, campaigns: { status: "denied", reason: "Ruolo non confermato." } }, snapshot, now });
    const html = renderToStaticMarkup(React.createElement(AdminOperationalBrief, { items: deniedResult.items, attention: deniedResult.attention, attentionState: deniedResult.attentionState }));
    assert.match(html, /Accesso negato/);
    assert.match(html, /Ruolo non confermato/);
    assert.doesNotMatch(html, /admin.home.active_campaigns/);
  });

  test("brief Admin rende esplicita una fonte obsoleta", () => {
    const staleSources = Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, { ...value, observedAt: "2026-07-20T09:00:00Z" }]));
    const staleResult = buildAdminDashboardInsights({ sources: staleSources, snapshot, now });
    const html = renderToStaticMarkup(React.createElement(AdminOperationalBrief, { items: staleResult.items, attention: staleResult.attention, attentionState: staleResult.attentionState }));
    assert.match(html, /Dato da aggiornare/);
    assert.match(html, /12 obsoleti/);
  });
} finally {
  await vite.close();
}

console.log(`AI admin component render tests: ${passed} passed`);
