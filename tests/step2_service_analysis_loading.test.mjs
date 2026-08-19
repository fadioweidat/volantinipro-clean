import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useServiceAnalysis } from "../src/hooks/useServiceAnalysis.js";

// P0 "Step2 bloccato su Caricamento in corso...": useServiceAnalysis aveva
// due percorsi di ritorno anticipato nell'effect (zona non valida, richiesta
// duplicata) che non resettavano mai `loading` se un run PRECEDENTE
// dell'effect aveva gia' chiamato setLoading(true) e schedulato un fetch
// debounced (450ms) che poi veniva cancellato dal cleanup prima di partire
// davvero. Questi test guidano l'hook con react-test-renderer/act e timer
// reali (piu' lenti ma senza dipendenze extra) per riprodurre esattamente
// quella sequenza e verificare che loading torni sempre a false.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function HookProbe({ probeRef, args }) {
  const result = useServiceAnalysis(...args);
  probeRef.current = result;
  return null;
}

function mountProbe(initialArgs) {
  const probeRef = { current: null };
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(HookProbe, { probeRef, args: initialArgs }));
  });
  return {
    probeRef,
    update(args) {
      act(() => {
        renderer.update(React.createElement(HookProbe, { probeRef, args }));
      });
    },
    unmount() {
      act(() => {
        renderer.unmount();
      });
    },
  };
}

test("useServiceAnalysis — loading non resta mai bloccato a true", async (t) => {
  const originalFetch = global.fetch;
  const originalWindow = global.window;
  const originalSupabaseUrl = process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
  t.after(() => {
    global.fetch = originalFetch;
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
    process.env.VITE_SUPABASE_URL = originalSupabaseUrl;
  });

  await t.test("zona valida -> invalida PRIMA del debounce: loading torna false, mai bloccato", async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ values: {}, comuni_breakdown: [] }) });

    const validArgs = [45.8, 8.8, 5, "d2d", "Varese"];
    const invalidArgs = [45.8, 8.8, 5, "d2d", null]; // municipality null -> hasValidZone false

    const probe = mountProbe(validArgs);
    // Subito dopo il mount con zona valida, l'effect ha gia' chiamato
    // setLoading(true) e schedulato il fetch debounced (450ms) — verificato
    // qui per confermare che stiamo davvero catturando il caso "fetch mai
    // partito", non un fetch gia' completato per puro timing.
    assert.equal(probe.probeRef.current.loading, true, "loading deve essere true subito dopo il mount con zona valida");

    // Cambiamo la zona a invalida BEN PRIMA dei 450ms di debounce: il
    // cleanup dell'effect precedente cancella il timer (il fetch non parte
    // mai), il nuovo run dell'effect vede hasValidZone=false.
    await delay(50);
    probe.update(invalidArgs);

    // Nessun fetch in corso puo' piu' risolvere `loading` da qui in poi —
    // prima della fix questo restava true per sempre.
    await delay(600); // oltre il vecchio debounce di 450ms, per sicurezza
    assert.equal(probe.probeRef.current.loading, false, "BUG: loading resta bloccato a true dopo zona valida->invalida entro il debounce");

    probe.unmount();
  });

  await t.test("stessa requestKey ripristinata rapidamente (dedup): loading torna false", async () => {
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      return { ok: true, json: async () => ({ values: {}, comuni_breakdown: [] }) };
    };

    const argsA = [45.8, 8.8, 5, "d2d", "Varese"];
    const argsB = [45.9, 8.9, 5, "d2d", "Milano"];

    const probe = mountProbe(argsA);
    // Lasciamo completare il primo fetch per popolare `data` (necessario
    // perche' il ramo di dedup controlla anche `data !== null`).
    await delay(600);
    assert.equal(probe.probeRef.current.loading, false);
    assert.ok(probe.probeRef.current.data, "il primo fetch deve aver popolato data");
    const callsAfterFirst = fetchCalls;

    // Passiamo a B (schedula un nuovo fetch debounced) poi torniamo A PRIMA
    // che il debounce di B scatti: il run per B chiama setLoading(true), il
    // run successivo (torno ad A) trova lastRequestKeyRef gia' = A e
    // data!==null -> ramo di dedup, che prima della fix non resettava
    // loading.
    probe.update(argsB);
    await delay(50);
    probe.update(argsA);
    await delay(600);

    assert.equal(probe.probeRef.current.loading, false, "BUG: loading resta bloccato a true dopo un toggle rapido A->B->A (ramo dedup)");
    assert.equal(fetchCalls, callsAfterFirst, "il ramo di dedup non deve rifare un fetch di rete per una richiesta gia' completata");

    probe.unmount();
  });

  await t.test("pageshow con persisted=true forza una rivalutazione pulita (resilienza bfcache)", async () => {
    let resolveHangingFetch = null;
    let fetchCalls = 0;
    global.fetch = async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        // Simula una fetch il cui underlying network layer viene ucciso dal
        // browser durante il freeze bfcache: la Promise non si risolve MAI
        // (ne' resolve ne' reject) — esattamente il caso che il pageshow
        // listener deve saper recuperare.
        return new Promise(() => {});
      }
      resolveHangingFetch?.();
      return { ok: true, json: async () => ({ values: {}, comuni_breakdown: [] }) };
    };

    const listeners = {};
    global.window = {
      addEventListener: (type, fn) => { listeners[type] = fn; },
      removeEventListener: (type, fn) => { if (listeners[type] === fn) delete listeners[type]; },
    };

    const probe = mountProbe([45.8, 8.8, 5, "d2d", "Varese"]);
    await delay(600); // il primo fetch e' partito e resta appeso (mai risolto)
    assert.equal(probe.probeRef.current.loading, true, "il primo fetch (appeso) deve lasciare loading=true, come farebbe un vero freeze bfcache");
    assert.equal(probe.probeRef.current.data, null, "nessun dato deve essere arrivato dal fetch appeso");

    assert.ok(typeof listeners.pageshow === "function", "il listener pageshow deve essere registrato");
    act(() => {
      listeners.pageshow({ persisted: true });
    });

    await delay(600); // nuovo debounce dopo il bump del nonce, poi il secondo fetch (che risolve)

    assert.equal(fetchCalls, 2, "il pageshow persisted deve innescare un nuovo tentativo di fetch, non restare fermo su quello appeso");
    assert.equal(probe.probeRef.current.loading, false, "BUG: dopo il ripristino da bfcache, loading resta bloccato a true");
    assert.ok(probe.probeRef.current.data, "il secondo fetch (quello reale, dopo il ripristino) deve aver popolato data");

    probe.unmount();
  });
});
