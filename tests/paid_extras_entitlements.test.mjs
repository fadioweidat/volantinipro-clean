import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { campaignExtraAccess, GPS_EXTRA_KEYS, PHOTO_EXTRA_KEYS } from "../src/lib/campaignEntitlements.js";
import { buildFinalDistributionReport } from "../src/lib/reports/finalDistributionReport.js";
import { generateFinalDistributionPdfBytes } from "../src/lib/pdf/generateFinalDistributionPdf.js";
import { buildExtraServicesRegistry, OPTIONAL_EXTRAS_ORDER } from "../src/lib/extraServicesRegistry.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("access comes from every stored form of the extras", () => {
  assert.deepEqual(campaignExtraAccess({ extra_services: ["tracking_gps"] }), { gps: true, photos: false });
  assert.deepEqual(campaignExtraAccess({ extra_services: ["photo_proof"] }), { gps: false, photos: true });
  assert.deepEqual(campaignExtraAccess({ extra_services: ["control_pro"] }), { gps: true, photos: true });
  assert.deepEqual(campaignExtraAccess({ servizi_extra: [{ id: "photo_report_advanced", label: "Report fotografico" }] }), { gps: false, photos: true });
  assert.deepEqual(campaignExtraAccess({ servizi_extra: ["Tracking GPS Live", "Report Fotografico Completo"] }), { gps: true, photos: true });
  assert.deepEqual(campaignExtraAccess({ quote_summary: { business: { proofs: ["GPS", "Foto geolocalizzate"] } } }), { gps: true, photos: true });
});

test("no extras, unrelated extras and malformed metadata give no access", () => {
  for (const metadata of [null, undefined, {}, { extra_services: "tracking_gps" }, { extra_services: ["puntiVetrina"] }, { servizi_extra: [null, 3] }]) {
    assert.deepEqual(campaignExtraAccess(metadata), { gps: false, photos: false });
  }
});

test("the migration uses the same lists as the site", () => {
  const sql = read("supabase/migrations/20261030200000_paid_extras_entitlements.sql");
  const list = (kind) => [...sql.match(new RegExp("when '" + kind + "' then array\\[(.*?)\\]"))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(list("gps"), [...GPS_EXTRA_KEYS]);
  assert.deepEqual(list("photos"), [...PHOTO_EXTRA_KEYS]);
});

test("the migration only narrows the customer branch of reads", () => {
  const sql = read("supabase/migrations/20261030200000_paid_extras_entitlements.sql");
  assert.doesNotMatch(sql, /for (insert|update|delete|all)/i);
  assert.equal((sql.match(/driver_id = auth\.uid\(\)/g) || []).length, 5);
  assert.doesNotMatch(sql, /issue_photos_storage_select/);
});

const base = { campaign: { title: "Prova" }, zones: [{ id: "z", zone_name: "Rho", quantity_assigned: 1000, status: "completata" }], sessions: [{ id: "s", campaign_zone_id: "z", status: "completed", started_at: "2026-10-01T08:00:00Z", ended_at: "2026-10-01T12:00:00Z" }] };

test("the base report has no GPS or photo content, including the PDF", () => {
  const report = buildFinalDistributionReport({ ...base, access: { gps: false, photos: false } });
  assert.deepEqual(report.anomalies, []);
  const pdf = Buffer.from(generateFinalDistributionPdfBytes(report)).toString("latin1");
  assert.match(pdf, /REPORT FINALE DI DISTRIBUZIONE/);
  assert.match(pdf, /Rho/);
  for (const hidden of ["GPS", "Sessioni", "fotografiche", "Timeline"]) assert.ok(!pdf.includes(hidden), hidden);
});

test("the full report keeps GPS and photo sections", () => {
  const report = buildFinalDistributionReport(base);
  const pdf = Buffer.from(generateFinalDistributionPdfBytes(report)).toString("latin1");
  assert.match(pdf, /TRACCIAMENTO GPS E COPERTURA/);
  assert.match(pdf, /Prove fotografiche approvate/);
});

test("customer pages skip paid data, Admin keeps everything", () => {
  const api = read("src/lib/services/final-report-api.js");
  assert.match(api, /customerOwned \? campaignExtraAccess\(campaign\.metadata\) : FULL_EXTRA_ACCESS/);
  const customer = read("src/lib/services/customer-api.js");
  assert.match(customer, /access\.gps \? getCustomerCampaignGpsPoints/);
  assert.match(customer, /access\.photos \? getCampaignProofPhotos/);
  assert.match(customer, /getCustomerIssues\(campaignId\)/);
});

test("one photo offer and a clear Controllo PRO", () => {
  assert.ok(!OPTIONAL_EXTRAS_ORDER.includes("photo_proof"));
  const registry = buildExtraServicesRegistry({});
  assert.ok(registry.some((extra) => extra.id === "photo_proof"), "old quotes stay readable");
  const pro = registry.find((extra) => extra.id === "control_pro");
  assert.equal(pro.optionalDescription, "Tracking GPS + Report fotografico: €99 invece di €110, risparmi €11.");
});

test("no certification wording left and the homepage preview is an example", () => {
  for (const file of ["src/components/reports/FinalDistributionReportView.jsx", "src/lib/pdf/generateFinalDistributionPdf.js", "src/pages/customer/ClientCampaignReport.jsx", "src/pages/admin/CampaignReport.jsx", "src/pages/customer/AdvancedCoverageReport.jsx", "src/components/ai/global/assistantRouteRegistry.js"]) {
    assert.ok(!/certificaz/i.test(read(file)), file);
  }
  const home = read("src/components/home/DashboardClienteSection.jsx");
  assert.match(home, />Esempio</);
  assert.ok(!home.includes("Verificate GPS"));
});
