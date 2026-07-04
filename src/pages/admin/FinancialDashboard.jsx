import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { getRealCampaigns, selectOptionalTable } from "../../lib/services/admin-api.js";
import {
  PAYMENT_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  buildEconomicCsv,
  buildEconomicDashboard,
  euro,
  matchesEconomicSearch,
  percent,
} from "../../lib/services/economics.js";

const C = {
  orange: "#E8571A",
  green: "#2ECC8A",
  yellow: "#FBBF24",
  red: "#F87171",
  blue: "#60A5FA",
  purple: "#A78BFA",
  white: "#FFFFFF",
};

const F = {
  sans: "'DM Sans', Inter, system-ui, sans-serif",
  serif: "'DM Serif Display', Georgia, serif",
};

const EMPTY = "Dato non disponibile";

export function FinancialDashboard() {
  const [state, setState] = useState({ loading: true, error: "", data: null, schema: [] });
  const [search, setSearch] = useState("");
  const [quoteStatus, setQuoteStatus] = useState("all");
  const [period, setPeriod] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        console.info("[ECONOMICS_DASHBOARD_LOAD]", { scope: "admin_finance" });
        const loaded = await loadEconomicData();
        console.info("[ECONOMICS_SCHEMA_CHECK]", loaded.schema);
        console.info("[ECONOMICS_KPI_LOAD]", {
          quotes: loaded.data.quotes.length,
          payments: loaded.data.payments.length,
          revenueAvailable: loaded.data.revenue.available,
          marginAvailable: loaded.data.margin.available,
        });
        if (!cancelled) setState({ loading: false, error: "", data: loaded.data, schema: loaded.schema });
      } catch (error) {
        console.error("[ECONOMICS_ERROR]", { error: error?.message || String(error) });
        if (!cancelled) setState({ loading: false, error: error?.message || "Errore caricamento gestione economica.", data: null, schema: [] });
      }
    }
    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const data = state.data || buildEconomicDashboard();
  const filteredQuotes = useMemo(() => {
    return data.quotes
      .filter((item) => matchesEconomicSearch(item, search))
      .filter((item) => quoteStatus === "all" || item.status === quoteStatus)
      .filter((item) => period === "all" || matchesPeriod(item.issuedAt, period));
  }, [data.quotes, search, quoteStatus, period]);

  const filteredPayments = useMemo(() => {
    return data.payments.filter((item) => paymentStatus === "all" || item.status === paymentStatus);
  }, [data.payments, paymentStatus]);

  const exportCsv = () => {
    if (!filteredQuotes.length) {
      setNotice("Nessun preventivo esportabile con i filtri attuali.");
      console.info("[ECONOMICS_EMPTY_STATE]", { area: "csv_export", reason: "no_filtered_quotes" });
      return;
    }
    const csv = buildEconomicCsv(filteredQuotes);
    downloadBlob(csv, "volantinipro-gestione-economica.csv", "text/csv;charset=utf-8");
    console.info("[ECONOMICS_EXPORT]", { type: "csv", rows: filteredQuotes.length });
    setNotice(`CSV esportato con ${filteredQuotes.length} record economici reali.`);
  };

  const exportExcel = () => {
    if (!filteredQuotes.length) {
      setNotice("Nessun preventivo esportabile con i filtri attuali.");
      return;
    }
    const rows = filteredQuotes.map((item) => ({
      ID: item.id,
      Cliente: item.client,
      Servizio: item.serviceLabel,
      Comune: item.zone,
      Quantita: item.qty ?? "",
      Prezzo: item.price ?? "",
      Extra: item.extras,
      IVA: item.vat ?? "",
      Totale: item.total ?? "",
      Emissione: item.issuedAt || "",
      Scadenza: item.expiresAt || "",
      Versione: item.version,
      Operatore: item.operator,
      Stato: item.statusLabel,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Economia");
    XLSX.writeFile(workbook, "volantinipro-gestione-economica.xlsx");
    console.info("[ECONOMICS_EXPORT]", { type: "excel", rows: filteredQuotes.length });
    setNotice(`Excel esportato con ${filteredQuotes.length} record economici reali.`);
  };

  const printPdf = () => {
    console.info("[ECONOMICS_EXPORT]", { type: "print_pdf", rows: filteredQuotes.length });
    window.print();
  };

  const revenueCards = [
    { label: "Fatturato oggi", value: data.revenue.available ? euro(data.revenue.today) : EMPTY, sub: data.revenue.available ? "da preventivi/campagne con importo" : data.revenue.reason, color: C.green },
    { label: "Fatturato settimana", value: data.revenue.available ? euro(data.revenue.week) : EMPTY, sub: "ultimi 7 giorni", color: C.green },
    { label: "Fatturato mese", value: data.revenue.available ? euro(data.revenue.month) : EMPTY, sub: "mese corrente", color: C.orange },
    { label: "Fatturato anno", value: data.revenue.available ? euro(data.revenue.year) : EMPTY, sub: "anno corrente", color: C.orange },
    { label: "Margine operativo", value: data.margin.available ? euro(data.margin.value) : EMPTY, sub: data.margin.available ? "ricavi meno costi configurati" : data.margin.reason, color: data.margin.available ? C.green : "rgba(255,255,255,.55)" },
    { label: "Valore medio ordine", value: Number.isFinite(data.stats.averageOrder) ? euro(data.stats.averageOrder) : EMPTY, sub: "calcolato solo su importi validi", color: C.blue },
  ];

  const quoteCards = [
    { label: "Preventivi inviati", value: data.stats.quoteStatuses.sent, color: C.blue },
    { label: "Preventivi accettati", value: data.stats.quoteStatuses.accepted + data.stats.quoteStatuses.converted, color: C.green },
    { label: "Preventivi rifiutati", value: data.stats.quoteStatuses.refused, color: C.red },
    { label: "Preventivi in attesa", value: data.stats.quoteStatuses.pending + data.stats.quoteStatuses.draft + data.stats.quoteStatuses.viewed, color: C.yellow },
  ];

  const paymentCards = [
    { label: "Pagamenti ricevuti", value: paymentValue(data, "paid"), sub: paymentSub(data, "paid"), color: C.green },
    { label: "Pagamenti in attesa", value: paymentValue(data, "pending"), sub: paymentSub(data, "pending"), color: C.yellow },
    { label: "Pagamenti scaduti", value: paymentValue(data, "overdue"), sub: paymentSub(data, "overdue"), color: C.red },
    { label: "Rimborsi", value: data.availability.payments ? euro(data.stats.refunds || 0) : EMPTY, sub: data.availability.payments ? "da pagamenti rimborsati" : "Tabelle pagamenti non configurate", color: C.purple },
    { label: "Crediti", value: Number.isFinite(data.stats.credits) ? euro(data.stats.credits) : EMPTY, sub: Number.isFinite(data.stats.credits) ? "da fatture non saldate" : "Tabella fatture o importi non configurati", color: C.blue },
    { label: "Debiti", value: Number.isFinite(data.stats.debts) ? euro(data.stats.debts) : EMPTY, sub: Number.isFinite(data.stats.debts) ? "da fornitori reali" : "Tabella fornitori o importi non configurati", color: C.orange },
  ];

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <div style={adminBadgeStyle}>ADMIN FINANCE</div>
          <h1 style={titleStyle}>Gestione economica</h1>
          <p style={subtitleStyle}>Dashboard finanziaria, preventivi, pagamenti, fatture e analisi. Solo dati reali Supabase.</p>
        </div>
        <div style={headerActionsStyle}>
          <a href="/admin/dashboard" style={secondaryButtonStyle}>Dashboard</a>
          <button onClick={printPdf} style={secondaryButtonStyle}>Stampa / PDF</button>
          <button onClick={exportExcel} style={secondaryButtonStyle}>Excel</button>
          <button onClick={exportCsv} style={primaryButtonStyle}>CSV</button>
        </div>
      </header>

      {state.loading && <Notice text="Caricamento gestione economica real-time..." />}
      {state.error && <Notice text={state.error} danger />}
      {notice && <Notice text={notice} />}

      <section style={gridStyle}>
        {revenueCards.map((card) => <KpiCard key={card.label} {...card} />)}
      </section>

      <section style={gridStyle}>
        {quoteCards.map((card) => <KpiCard key={card.label} {...card} sub="stato preventivi reali" />)}
      </section>

      <section style={gridStyle}>
        {paymentCards.map((card) => <KpiCard key={card.label} {...card} />)}
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Ricerca e filtri</p>
            <span style={mutedStyle}>Cliente, preventivo, fattura, pagamento, importo, comune o periodo.</span>
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cerca cliente, comune, ID, importo..." style={inputStyle} />
        </div>
        <div style={filterRowStyle}>
          {filterButton("all", quoteStatus, setQuoteStatus, "Tutti")}
          {Object.entries(QUOTE_STATUS_LABELS).map(([key, label]) => filterButton(key, quoteStatus, setQuoteStatus, label))}
        </div>
        <div style={filterRowStyle}>
          {["all", "today", "week", "month", "year"].map((key) => filterButton(key, period, setPeriod, periodLabel(key), C.green))}
        </div>
      </section>

      <div style={layoutStyle}>
        <section style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>Gestione preventivi</p>
              <span style={mutedStyle}>{filteredQuotes.length} record visualizzati. Versioni, storico e operatori vengono mostrati solo se presenti nel database.</span>
            </div>
          </div>
          {filteredQuotes.length ? (
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["ID", "Cliente", "Servizio", "Comune", "Quantita", "Prezzo", "Extra", "IVA", "Totale", "Emissione", "Scadenza", "Versione", "Operatore", "Stato"].map((head) => (
                      <th key={head} style={thStyle}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((item) => (
                    <tr key={`${item.source}-${item.id}`}>
                      <td style={tdStyle}>{item.id}</td>
                      <td style={tdStrongStyle}>{item.client}</td>
                      <td style={tdStyle}>{item.serviceLabel}</td>
                      <td style={tdStyle}>{item.zone}</td>
                      <td style={tdStyle}>{item.qty ? item.qty.toLocaleString("it-IT") : "n/d"}</td>
                      <td style={tdStyle}>{Number.isFinite(item.price) ? euro(item.price) : "n/d"}</td>
                      <td style={tdStyle}>{item.extras}</td>
                      <td style={tdStyle}>{Number.isFinite(item.vat) ? euro(item.vat) : "n/d"}</td>
                      <td style={tdStrongStyle}>{Number.isFinite(item.total) ? euro(item.total) : EMPTY}</td>
                      <td style={tdStyle}>{item.issuedAt || "n/d"}</td>
                      <td style={tdStyle}>{item.expiresAt || "n/d"}</td>
                      <td style={tdStyle}>{item.version}</td>
                      <td style={tdStyle}>{item.operator}</td>
                      <td style={tdStyle}><Badge label={item.statusLabel} tone={quoteTone(item.status)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="Nessun preventivo reale trovato con i filtri attuali." />
          )}
        </section>

        <aside style={{ display: "grid", gap: 14, alignContent: "start" }}>
          <Panel title="Pagamenti" meta={data.availability.payments ? `${filteredPayments.length} record` : "non configurato"}>
            <div style={filterRowStyle}>
              {filterButton("all", paymentStatus, setPaymentStatus, "Tutti", C.green)}
              {Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) => filterButton(key, paymentStatus, setPaymentStatus, label, C.green))}
            </div>
            {data.availability.payments ? (
              filteredPayments.length ? filteredPayments.slice(0, 8).map((item) => (
                <MiniRow key={item.id} title={`${item.client} - ${Number.isFinite(item.amount) ? euro(item.amount) : EMPTY}`} subtitle={`${PAYMENT_STATUS_LABELS[item.status] || item.status} - ${item.method} - scadenza ${item.dueDate || "n/d"}`} />
              )) : <EmptyState text="Nessun pagamento con questo filtro." />
            ) : <EmptyState text="Tabelle pagamenti non configurate nel database. Nessun dato finto mostrato." />}
          </Panel>

          <Panel title="Fatture" meta={data.availability.invoices ? `${data.invoices.length} record` : "non configurato"}>
            {data.availability.invoices && data.invoices.length ? data.invoices.slice(0, 8).map((item) => (
              <MiniRow key={item.id} title={`${item.number} - ${item.client}`} subtitle={`${Number.isFinite(item.amount) ? euro(item.amount) : EMPTY} - scadenza ${item.dueDate || "n/d"}`} />
            )) : <EmptyState text="Nessuna tabella fatture configurata o nessuna fattura registrata." />}
          </Panel>

          <Panel title="Fornitori" meta={data.availability.suppliers ? `${data.suppliers.length} record` : "non configurato"}>
            {data.availability.suppliers && data.suppliers.length ? data.suppliers.slice(0, 8).map((item) => (
              <MiniRow key={item.id} title={item.name} subtitle={`Dovuto ${Number.isFinite(item.due) ? euro(item.due) : "n/d"} - pagato ${Number.isFinite(item.paid) ? euro(item.paid) : "n/d"}`} />
            )) : <EmptyState text="Nessuna tabella fornitori configurata o nessun fornitore registrato." />}
          </Panel>
        </aside>
      </div>

      <section style={gridTwoStyle}>
        <Panel title="Analisi clienti" meta="reale">
          {data.stats.topClients.length ? data.stats.topClients.map((item) => (
            <MiniRow key={item.client} title={item.client} subtitle={`${item.quotes} preventivi - fatturato ${euro(item.total)} - media ${euro(item.total / item.quotes)}`} />
          )) : <EmptyState text="Nessun cliente analizzabile: mancano record economici reali." />}
        </Panel>

        <Panel title="Analisi servizi" meta="reale">
          {data.stats.topServices.length ? data.stats.topServices.map((item) => (
            <MiniRow key={item.service} title={item.service} subtitle={`${item.quotes} preventivi - ricavi ${euro(item.total)}`} />
          )) : <EmptyState text="Nessun servizio analizzabile: mancano preventivi con servizio reale." />}
        </Panel>

        <Panel title="Audit log" meta={data.availability.activities ? `${data.activities.length} eventi` : "non configurato"}>
          {data.availability.activities && data.activities.length ? data.activities.map((item) => (
            <MiniRow key={item.id} title={item.action} subtitle={`${item.user} - ${item.date || "n/d"}`} />
          )) : <EmptyState text="Nessuna tabella audit/eventi configurata. Le esportazioni vengono loggate in console admin." />}
        </Panel>

        <Panel title="Verifiche automatiche" meta="controlli">
          <MiniRow title="Importi" subtitle={data.revenue.available ? "Importi rilevati e normalizzati da campi reali." : data.revenue.reason} />
          <MiniRow title="Scadenze" subtitle={data.quotes.some((item) => item.expiresAt) ? "Scadenze preventivo presenti." : "Scadenze preventivo non configurate nei record attuali."} />
          <MiniRow title="Duplicati" subtitle={`${findDuplicateIds(data.quotes).length} ID duplicati rilevati nei record normalizzati.`} />
          <MiniRow title="Conversione preventivi" subtitle={Number.isFinite(data.stats.conversionRate) ? percent(data.stats.conversionRate) : EMPTY} />
        </Panel>
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Tabelle e colonne rilevate</p>
        <div style={schemaGridStyle}>
          {state.schema.map((item) => (
            <div key={item.name} style={schemaCardStyle}>
              <strong style={{ color: item.available ? C.green : "rgba(255,255,255,.45)", fontFamily: F.sans, fontSize: 12 }}>{item.name}</strong>
              <span style={mutedStyle}>{item.available ? `${item.rows} righe lette` : "non disponibile o non configurata"}</span>
              {item.columns.length > 0 && <span style={mutedStyle}>Colonne: {item.columns.join(", ")}</span>}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

async function loadEconomicData() {
  const [
    campaignsResult,
    quoteRequests,
    payments,
    pagamenti,
    invoices,
    fatture,
    suppliers,
    fornitori,
    activityLog,
    auditLog,
  ] = await Promise.all([
    getRealCampaigns({ includeTest: true }),
    selectOptionalTable("quote_requests", null),
    selectOptionalTable("payments", null),
    selectOptionalTable("pagamenti", null),
    selectOptionalTable("invoices", null),
    selectOptionalTable("fatture", null),
    selectOptionalTable("suppliers", null),
    selectOptionalTable("fornitori", null),
    selectOptionalTable("activity_log", null),
    selectOptionalTable("audit_log", null),
  ]);

  const paymentRows = mergeRows(payments, pagamenti);
  const invoiceRows = mergeRows(invoices, fatture);
  const supplierRows = mergeRows(suppliers, fornitori);
  const activityRows = mergeRows(activityLog, auditLog);
  const data = buildEconomicDashboard({
    campaigns: campaignsResult.rows,
    quoteRows: quoteRequests.rows,
    paymentRows,
    invoiceRows,
    supplierRows,
    activityRows,
    availability: {
      quotes: campaignsResult.availability.campaigns || quoteRequests.available,
      payments: payments.available || pagamenti.available,
      invoices: invoices.available || fatture.available,
      suppliers: suppliers.available || fornitori.available,
      activities: activityLog.available || auditLog.available,
    },
  });

  return {
    data,
    schema: [
      schemaItem("campaigns/campagne/quote_requests", campaignsResult.availability.campaigns || quoteRequests.available, campaignsResult.rows.length + quoteRequests.rows.length, [...campaignsResult.rows, ...quoteRequests.rows]),
      schemaItem("payments", payments.available, payments.rows.length, payments.rows),
      schemaItem("pagamenti", pagamenti.available, pagamenti.rows.length, pagamenti.rows),
      schemaItem("invoices", invoices.available, invoices.rows.length, invoices.rows),
      schemaItem("fatture", fatture.available, fatture.rows.length, fatture.rows),
      schemaItem("suppliers", suppliers.available, suppliers.rows.length, suppliers.rows),
      schemaItem("fornitori", fornitori.available, fornitori.rows.length, fornitori.rows),
      schemaItem("activity_log", activityLog.available, activityLog.rows.length, activityLog.rows),
      schemaItem("audit_log", auditLog.available, auditLog.rows.length, auditLog.rows),
    ],
  };
}

function mergeRows(...results) {
  return results.flatMap((result) => result.rows || []);
}

function schemaItem(name, available, rows, sampleRows = []) {
  return {
    name,
    available: Boolean(available),
    rows: rows || 0,
    columns: sampleRows[0] ? Object.keys(sampleRows[0]).slice(0, 16) : [],
  };
}

function paymentValue(data, status) {
  if (!data.availability.payments) return EMPTY;
  const rows = data.payments.filter((item) => item.status === status);
  const total = rows.reduce((sum, item) => sum + (item.amount || 0), 0);
  return rows.length ? euro(total) : euro(0);
}

function paymentSub(data, status) {
  if (!data.availability.payments) return "Tabelle pagamenti non configurate";
  const count = data.payments.filter((item) => item.status === status).length;
  return `${count} record pagamento`;
}

function matchesPeriod(value, selected) {
  if (selected === "all") return true;
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return false;
  const now = new Date();
  if (selected === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return date >= start;
  }
  if (selected === "week") return now.getTime() - date.getTime() <= 7 * 24 * 60 * 60 * 1000;
  if (selected === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (selected === "year") return date.getFullYear() === now.getFullYear();
  return true;
}

function periodLabel(key) {
  return { all: "Tutti i periodi", today: "Oggi", week: "Settimana", month: "Mese", year: "Anno" }[key] || key;
}

function quoteTone(status) {
  if (status === "accepted" || status === "converted") return C.green;
  if (status === "refused" || status === "cancelled" || status === "expired") return C.red;
  if (status === "sent" || status === "viewed") return C.blue;
  return C.yellow;
}

function findDuplicateIds(rows) {
  const seen = new Set();
  const dupes = new Set();
  for (const row of rows) {
    if (!row.id || row.id === "n/d") continue;
    if (seen.has(row.id)) dupes.add(row.id);
    seen.add(row.id);
  }
  return [...dupes];
}

function downloadBlob(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>{label}</p>
      <strong style={{ display: "block", marginTop: 8, color, fontFamily: F.serif, fontSize: 27, letterSpacing: "-.7px" }}>{value}</strong>
      <span style={mutedStyle}>{sub}</span>
    </div>
  );
}

function Panel({ title, meta, children }) {
  return (
    <section style={cardStyle}>
      <div style={sectionHeaderStyle}>
        <p style={eyebrowStyle}>{title}</p>
        {meta && <span style={{ ...mutedStyle, color: C.orange }}>{meta}</span>}
      </div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </section>
  );
}

function MiniRow({ title, subtitle }) {
  return (
    <div style={miniRowStyle}>
      <strong style={{ color: C.white, fontFamily: F.sans, fontSize: 12 }}>{title}</strong>
      <span style={mutedStyle}>{subtitle}</span>
    </div>
  );
}

function Badge({ label, tone }) {
  return <span style={{ display: "inline-flex", padding: "4px 9px", borderRadius: 100, background: `${tone}18`, border: `1px solid ${tone}45`, color: tone, fontFamily: F.sans, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }}>{label}</span>;
}

function EmptyState({ text }) {
  return <div style={emptyStyle}>{text}</div>;
}

function Notice({ text, danger = false }) {
  return <div style={{ ...cardStyle, padding: 13, marginBottom: 14, border: `1px solid ${danger ? "rgba(248,113,113,.28)" : "rgba(46,204,138,.24)"}`, color: danger ? C.red : C.green, fontFamily: F.sans, fontSize: 12 }}>{text}</div>;
}

function filterButton(id, active, setActive, label, color = C.orange) {
  const selected = id === active;
  return (
    <button key={id} onClick={() => setActive(id)} style={{ padding: "6px 11px", borderRadius: 100, border: `1px solid ${selected ? color : "rgba(255,255,255,.13)"}`, background: selected ? `${color}1F` : "rgba(255,255,255,.04)", color: selected ? color : "rgba(255,255,255,.66)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
      {label}
    </button>
  );
}

const pageStyle = { maxWidth: 1380, margin: "0 auto", padding: "24px 24px 70px", minHeight: "100vh" };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 22 };
const headerActionsStyle = { display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "flex-end" };
const titleStyle = { fontFamily: F.serif, fontSize: 34, color: C.white, letterSpacing: "-1px", margin: "8px 0 4px" };
const subtitleStyle = { margin: 0, fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.52)" };
const adminBadgeStyle = { display: "inline-flex", padding: "4px 12px", borderRadius: 100, background: "rgba(232,87,26,.15)", border: "1px solid rgba(232,87,26,.3)", fontFamily: F.sans, fontSize: 11, fontWeight: 800, color: C.orange };
const cardStyle = { background: "#122036", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", padding: 18, boxShadow: "0 18px 70px rgba(0,0,0,.18)" };
const primaryButtonStyle = { minHeight: 40, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(232,87,26,.42)", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 12, fontWeight: 900, cursor: "pointer" };
const secondaryButtonStyle = { minHeight: 40, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.055)", color: C.white, textDecoration: "none", display: "inline-flex", alignItems: "center", fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: "pointer" };
const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 16 };
const gridTwoStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))", gap: 14, margin: "16px 0" };
const layoutStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16, marginTop: 16 };
const sectionHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 };
const eyebrowStyle = { margin: 0, fontFamily: F.sans, fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,.46)", letterSpacing: ".12em", textTransform: "uppercase" };
const mutedStyle = { fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.48)", lineHeight: 1.45 };
const inputStyle = { flex: "1 1 280px", maxWidth: 440, minWidth: 220, height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,.13)", background: "rgba(255,255,255,.045)", color: C.white, padding: "0 13px", fontFamily: F.sans, fontSize: 13, outline: "none" };
const filterRowStyle = { display: "flex", gap: 7, flexWrap: "wrap", marginTop: 9 };
const tableWrapStyle = { width: "100%", overflowX: "auto", border: "1px solid rgba(255,255,255,.07)", borderRadius: 12 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 1180 };
const thStyle = { padding: "11px 10px", textAlign: "left", color: "rgba(255,255,255,.46)", fontFamily: F.sans, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".08em", borderBottom: "1px solid rgba(255,255,255,.07)" };
const tdStyle = { padding: "12px 10px", color: "rgba(255,255,255,.66)", fontFamily: F.sans, fontSize: 12, borderBottom: "1px solid rgba(255,255,255,.045)", verticalAlign: "top" };
const tdStrongStyle = { ...tdStyle, color: C.white, fontWeight: 800 };
const miniRowStyle = { display: "grid", gap: 3, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.055)" };
const emptyStyle = { padding: 14, border: "1px dashed rgba(255,255,255,.14)", borderRadius: 10, color: "rgba(255,255,255,.45)", fontFamily: F.sans, fontSize: 12, lineHeight: 1.5 };
const schemaGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginTop: 12 };
const schemaCardStyle = { display: "grid", gap: 5, padding: 12, borderRadius: 10, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.035)" };
