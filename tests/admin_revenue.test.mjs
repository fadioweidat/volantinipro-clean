import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const mapMockPlugin = {
  name: "admin-revenue-map-mock",
  enforce: "pre",
  resolveId(id) {
    return id.endsWith("/components/admin/AdminOperationalMap.jsx") || id.endsWith("\\components\\admin\\AdminOperationalMap.jsx")
      ? "\0admin-revenue-map-mock"
      : null;
  },
  load(id) {
    if (id !== "\0admin-revenue-map-mock") return null;
    return "export const AdminOperationalMap = () => null;";
  },
};
const vite = await createServer({ plugins: [mapMockPlugin], server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const { normalizeCampaign } = await vite.ssrLoadModule("/src/pages/admin/AdminDashboard.jsx");
after(async () => vite.close());

function campaignWithRevenue(totalAmount) {
  return normalizeCampaign({
    id: "20000000-0000-0000-0000-000000000001",
    client_name: "Cliente reale",
    city_name: "Milano",
    total_flyers: 1000,
    status: "active",
    latitude: 45.4642,
    longitude: 9.19,
    service_type: "d2d",
    total_amount: totalAmount,
  }, "campaigns");
}

test("Revenue ufficiale distingue dato mancante, zero reale e valore positivo", async (t) => {
  await t.test("null resta dato mancante", () => {
    assert.equal(campaignWithRevenue(null).total, null);
  });

  await t.test("undefined resta dato mancante", () => {
    assert.equal(campaignWithRevenue(undefined).total, null);
  });

  await t.test("zero numerico resta una campagna reale con Revenue zero", () => {
    const campaign = campaignWithRevenue(0);
    assert.equal(campaign.total, 0);
    assert.equal(campaign.quality, "real");
  });

  await t.test("valore positivo viene convertito e resta reale", () => {
    const campaign = campaignWithRevenue("150.50");
    assert.equal(campaign.total, 150.5);
    assert.equal(campaign.quality, "real");
  });
});
