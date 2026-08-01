import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildProofPhotoStoragePath } from "../src/lib/services/gps-api.js";

test("buildProofPhotoStoragePath", async (t) => {
  // Il path deve combaciare ESATTAMENTE con la policy RLS
  // proof_photos_storage_insert_authorized su storage.objects: segmenti
  // letterali "campaign"/"session"/"photo" e un uuid v4 come nome file,
  // altrimenti la policy nega l'upload con 403 indipendentemente dai
  // permessi sulla riga proof_photos.
  await t.test("segue il formato campaign/<id>/session/<id>/photo/<uuid>.jpg richiesto dalla policy storage", () => {
    const path = buildProofPhotoStoragePath({
      campaignId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
    });
    assert.match(
      path,
      /^campaign\/11111111-1111-4111-8111-111111111111\/session\/22222222-2222-4222-8222-222222222222\/photo\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/,
    );
  });

  await t.test("sessionId assente o non valido -> fallisce chiuso (nessuna sessione GPS attiva = nessun upload possibile)", () => {
    assert.throws(() => buildProofPhotoStoragePath({ campaignId: "11111111-1111-4111-8111-111111111111", sessionId: null }));
    assert.throws(() => buildProofPhotoStoragePath({ campaignId: "11111111-1111-4111-8111-111111111111", sessionId: "not-a-uuid" }));
  });

  await t.test("due chiamate ravvicinate producono path diversi (nessuna sovrascrittura silenziosa)", () => {
    const args = { campaignId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222" };
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
