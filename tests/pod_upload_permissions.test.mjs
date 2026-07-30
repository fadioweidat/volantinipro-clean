import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildProofPhotoStoragePath } from "../src/lib/services/gps-api.js";

test("buildProofPhotoStoragePath", async (t) => {
  await t.test("include campagna, sessione e autista nel path (deterministico)", () => {
    const path = buildProofPhotoStoragePath({
      campaignId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      driverId: "33333333-3333-4333-8333-333333333333",
    });
    assert.ok(path.startsWith("11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/"));
    assert.match(path, /\.jpg$/);
  });

  await t.test("sessionId assente o non valido -> segmento 'no-session', mai vuoto", () => {
    const withoutSession = buildProofPhotoStoragePath({ campaignId: "11111111-1111-4111-8111-111111111111", sessionId: null, driverId: "d1" });
    assert.match(withoutSession, /^11111111-1111-4111-8111-111111111111\/no-session\/d1\//);

    const withInvalidSession = buildProofPhotoStoragePath({ campaignId: "11111111-1111-4111-8111-111111111111", sessionId: "not-a-uuid", driverId: "d1" });
    assert.match(withInvalidSession, /^11111111-1111-4111-8111-111111111111\/no-session\/d1\//);
  });

  await t.test("due chiamate ravvicinate producono path diversi (nessuna sovrascrittura silenziosa)", () => {
    const args = { campaignId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222", driverId: "d1" };
    const first = buildProofPhotoStoragePath(args);
    const second = buildProofPhotoStoragePath(args);
    assert.notEqual(first, second);
  });
});

test("uploadProofPhoto: contratto sorgente sui permessi", async (t) => {
  const source = readFileSync("src/lib/services/gps-api.js", "utf8");
  const body = source.slice(
    source.indexOf("export async function uploadProofPhoto"),
    source.indexOf("export async function createProofPhotoSignedUrl"),
  );

  await t.test("il driver_id viene sempre derivato dalla sessione autenticata, mai accettato come parametro del chiamante", () => {
    assert.match(body, /const driverId = await getCurrentUserId\(\);/);
    const signature = body.slice(body.indexOf("({"), body.indexOf("})") + 2);
    assert.doesNotMatch(signature, /driverId/, "la firma della funzione non deve accettare driverId dal chiamante");
  });

  await t.test("campaignId viene validato prima di qualunque chiamata di rete", () => {
    const validateIndex = body.indexOf("isValidUuid(campaignId)");
    const uploadIndex = body.indexOf(".storage");
    assert.ok(validateIndex >= 0 && validateIndex < uploadIndex, "la validazione deve precedere l'upload");
  });

  await t.test("nessuna service-role o chiave privilegiata nel modulo frontend", () => {
    assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE/i);
  });

  await t.test("l'upload usa il bucket proof-photos gia' esistente, nessun bucket nuovo", () => {
    assert.match(body, /\.from\('proof-photos'\)/);
  });

  await t.test("l'insert del record passa dal client Supabase autenticato (RLS), non da una RPC che bypassa i permessi", () => {
    assert.match(body, /client\s*\n?\s*\.from\('proof_photos'\)\s*\n?\s*\.insert/);
  });
});
