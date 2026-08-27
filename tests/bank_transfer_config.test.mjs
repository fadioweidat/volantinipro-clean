// Pre-go-live: il pagamento tramite bonifico non deve MAI mostrare
// coordinate bancarie placeholder in produzione. Se VITE_IBAN /
// VITE_INTESTATARIO / VITE_BANCA non sono tutte configurate, la UI mostra
// "Pagamento tramite bonifico temporaneamente non disponibile." e nessun
// IBAN / intestatario / banca finto.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const MODULE_URL = new URL("../src/lib/bankTransfer.js", import.meta.url);
const ROUTED_SRC = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");
const LEGACY_SRC = readFileSync(new URL("../src/pages/PagamentoBonifico.jsx", import.meta.url), "utf8");

const KEYS = ["VITE_IBAN", "VITE_INTESTATARIO", "VITE_BANCA"];

function withEnv(values, fn) {
  const saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });
}

async function freshModule() {
  return import(`${MODULE_URL.href}?t=${Date.now()}-${Math.random()}`);
}

const PLACEHOLDERS = [
  "IT60 X0000 0000 0000 0000 0000 000",
  "IT60X0000000000000000000000000",
  "VolantiniPro Srl",
  "Banca Sella",
];

test("env mancanti: available=false, nessun valore placeholder restituito", async () => {
  await withEnv({}, async () => {
    const { getBankTransferDetails } = await freshModule();
    const d = getBankTransferDetails();
    assert.equal(d.available, false);
    assert.equal(d.iban, "");
    assert.equal(d.intestatario, "");
    assert.equal(d.banca, "");
    const blob = JSON.stringify(d);
    for (const p of PLACEHOLDERS) assert.ok(!blob.includes(p), `placeholder trapelato: ${p}`);
  });
});

test("env parziali (solo IBAN): available=false", async () => {
  await withEnv({ VITE_IBAN: "IT60 A0100 0000 0000 0000 0001 234" }, async () => {
    const { getBankTransferDetails } = await freshModule();
    const d = getBankTransferDetails();
    assert.equal(d.available, false, "una sola env non basta");
  });
});

test("env parziali (IBAN + intestatario, manca banca): available=false", async () => {
  await withEnv({ VITE_IBAN: "IT60 A0100 0000 0000 0000 0001 234", VITE_INTESTATARIO: "Acme Srl" }, async () => {
    const { getBankTransferDetails } = await freshModule();
    assert.equal(getBankTransferDetails().available, false);
  });
});

test("tutte e tre presenti: available=true, valori reali (trimmati) restituiti", async () => {
  await withEnv(
    { VITE_IBAN: "  IT60 A0100 0000 0000 0000 0001 234  ", VITE_INTESTATARIO: " Acme Srl ", VITE_BANCA: " Banca Reale " },
    async () => {
      const { getBankTransferDetails } = await freshModule();
      const d = getBankTransferDetails();
      assert.equal(d.available, true);
      assert.equal(d.iban, "IT60 A0100 0000 0000 0000 0001 234");
      assert.equal(d.intestatario, "Acme Srl");
      assert.equal(d.banca, "Banca Reale");
    },
  );
});

test("env presenti ma vuote/whitespace: available=false", async () => {
  await withEnv({ VITE_IBAN: "   ", VITE_INTESTATARIO: "", VITE_BANCA: "\t" }, async () => {
    const { getBankTransferDetails } = await freshModule();
    assert.equal(getBankTransferDetails().available, false);
  });
});

test("messaggio di indisponibilita' e' esplicito", async () => {
  const { BANK_TRANSFER_UNAVAILABLE_MESSAGE } = await freshModule();
  assert.match(BANK_TRANSFER_UNAVAILABLE_MESSAGE, /bonifico/i);
  assert.match(BANK_TRANSFER_UNAVAILABLE_MESSAGE, /non disponibile/i);
});

test("contratto sorgente: nessun fallback placeholder di coordinate bancarie nel codice", () => {
  for (const [name, src] of [["volantinipro-final.jsx", ROUTED_SRC], ["src/pages/PagamentoBonifico.jsx", LEGACY_SRC]]) {
    // Nessun `import.meta.env.VITE_IBAN || "..."` (o VITE_INTESTATARIO / VITE_BANCA).
    assert.doesNotMatch(
      src,
      /import\.meta\.env\.VITE_(IBAN|INTESTATARIO|BANCA)\s*\|\|/,
      `${name}: rimane un fallback placeholder su una env bancaria`,
    );
    // Nessun IBAN placeholder hardcoded.
    assert.doesNotMatch(src, /IT60\s?X0000/, `${name}: IBAN placeholder ancora presente`);
    // Entrambe le view usano il messaggio di indisponibilita'.
    assert.match(src, /BANK_TRANSFER_UNAVAILABLE_MESSAGE/, `${name}: non mostra il messaggio di bonifico non disponibile`);
    assert.match(src, /getBankTransferDetails\(\)/, `${name}: non usa il resolver senza placeholder`);
  }
  // "Banca Sella" non deve piu' comparire come costante operativa hardcoded.
  assert.doesNotMatch(LEGACY_SRC, /const\s+BANCA\s*=\s*['"]Banca Sella['"]/);
});

test("contratto sorgente: il resto del flusso conferma-campagna resta intatto", () => {
  // La fix e' circoscritta al blocco istruzioni bonifico: la pagina di
  // conferma e la navigazione dashboard non sono toccate.
  assert.match(ROUTED_SRC, /Campagna confermata!/);
  assert.match(ROUTED_SRC, /paymentStatus === "pagato"/);
  assert.match(LEGACY_SRC, /Campagna confermata!/);
  assert.match(LEGACY_SRC, /onNav\('dashboard'\)/);
});
