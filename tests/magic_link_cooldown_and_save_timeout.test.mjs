// 2026-10-22: magic link sent after the 15 s client timeout -> "Riprova" ->
// second link invalidated the first -> "link scaduto" dead end. Step 4 save had
// no client limit ("Salvataggio in corso..." without end).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAGIC_LINK_COOLDOWN_MS, MAGIC_LINK_COOLDOWN_KEY, magicLinkCooldownSeconds, readMagicLinkCooldown, startMagicLinkCooldown } from "../src/auth/magicLinkCooldown.js";
import { CAMPAIGN_SAVE_SLOW_NOTICE_MS, CAMPAIGN_SAVE_TIMEOUT_MS, isCampaignSaveTimeout, withCampaignSaveTimeout } from "../src/lib/campaignSaveTimeout.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test("cooldown: 60 s, survives reload, ignores corrupt or far-future values", () => {
  assert.equal(MAGIC_LINK_COOLDOWN_MS, 60000);
  const s = memory();
  const until = startMagicLinkCooldown(s, 1_000_000);
  assert.equal(until, 1_060_000);
  assert.equal(readMagicLinkCooldown(s, 1_000_500), 1_060_000, "still locked after a reload");
  assert.equal(magicLinkCooldownSeconds(until, 1_000_500), 60);
  assert.equal(magicLinkCooldownSeconds(until, 1_059_001), 1);
  assert.equal(readMagicLinkCooldown(s, 1_060_000), 0, "expired");
  s.setItem(MAGIC_LINK_COOLDOWN_KEY, String(1_000_000 + 10 * 60000));
  assert.equal(readMagicLinkCooldown(s, 1_000_000), 0, "further than one cooldown = corrupt");
  s.setItem(MAGIC_LINK_COOLDOWN_KEY, "abc");
  assert.equal(readMagicLinkCooldown(s, 1_000_000), 0);
  assert.equal(readMagicLinkCooldown({ getItem() { throw new Error("blocked"); } }), 0, "storage blocked");
  assert.doesNotThrow(() => startMagicLinkCooldown({ setItem() { throw new Error("blocked"); } }));
});

test("login page: button locked during cooldown (sent, slow or 429), guard before the request, countdown label", () => {
  const src = read("volantinipro-final.jsx");
  const page = src.slice(src.indexOf("export function LoginPage({"), src.indexOf("export function DashboardPage("));
  assert.match(page, /if \(isMagicLinkLocked\(\)\) return;/);
  assert.match(page, /const \{ cooldownSeconds, isLocked: isMagicLinkLocked, lock: lockMagicLinkButton \} = useMagicLinkCooldown\(\);/);
  assert.doesNotMatch(page, /setInterval\s*\(/, 'the countdown ticker lives in useMagicLinkCooldown, never a retry');
  assert.equal((page.match(/lockMagicLinkButton\(\);/g) || []).length, 3, "success, timeout and 429");
  assert.match(page, /disabled=\{busy \|\| cooldownSeconds > 0\}/);
  assert.match(page, /`Puoi richiedere un altro link tra \$\{cooldownSeconds\} s`/);
});

test("expired-link message tells the customer to use the most recent email", () => {
  assert.match(read("src/auth/session.js"), /Il magic link è scaduto o non è più valido\. Usa il link dell'email più recente: ogni nuova richiesta annulla quelle precedenti\./);
});

test("Step 4 save: slow notice after 10 s, stop after 60 s with a clear, retry-safe message", async () => {
  assert.equal(CAMPAIGN_SAVE_SLOW_NOTICE_MS, 10000);
  assert.equal(CAMPAIGN_SAVE_TIMEOUT_MS, 60000);
  await assert.rejects(withCampaignSaveTimeout(new Promise(() => {}), 20), (err) => isCampaignSaveTimeout(err) && /premi di nuovo «Conferma»/.test(err.message));
  assert.deepEqual(await withCampaignSaveTimeout(Promise.resolve({ data: 1 }), 50), { data: 1 });
  await assert.rejects(withCampaignSaveTimeout(Promise.reject(new Error("boom")), 50), (err) => err.message === "boom" && !isCampaignSaveTimeout(err));
  const step4 = read("src/pages/public/configurator/Step4.jsx");
  assert.match(step4, /res = await withCampaignSaveTimeout\(submitPublicCampaign\(payload\)\);/);
  assert.match(step4, /setTimeout\(\(\) => setSaveSlowNotice\(CAMPAIGN_SAVE_SLOW_MESSAGE\), CAMPAIGN_SAVE_SLOW_NOTICE_MS\)/);
  assert.match(step4, /isCampaignSaveTimeout\(err\) \? err\.message : "Errore durante il salvataggio della campagna: "/);
  assert.match(read("src/pages/public/configurator/step4/Step4CampaignActionsPanel.jsx"), /\{savingCampaign && saveSlowNotice && <div role="status" aria-live="polite"/);
});
