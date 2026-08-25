import fs from 'fs';
import path from 'path';

function runTests() {
  console.log("=== RUNNING VP-1 READ-ONLY COMPLIANCE TESTS ===");

  const functionPath = path.join(process.cwd(), 'supabase', 'functions', 'fadi-gateway', 'index.ts');
  if (!fs.existsSync(functionPath)) {
    console.error("❌ Fadi Gateway function non trovata.");
    process.exit(1);
  }

  const content = fs.readFileSync(functionPath, 'utf8');

  // Test 1: Nessuna operazione di mutazione permessa
  const forbiddenMethods = ['.insert(', '.update(', '.delete(', '.upsert('];
  let hasMutation = false;
  forbiddenMethods.forEach(method => {
    if (content.includes(method)) {
      console.error(`❌ ERRORE CRITICO: Trovato metodo mutativo '${method}' nel codice.`);
      hasMutation = true;
    }
  });

  if (hasMutation) {
    console.error("I test di read-only sono FALLITI.");
    process.exit(1);
  } else {
    console.log("✅ Nessuna operazione mutativa trovata. Il boundary è STRICTLY READ-ONLY.");
  }

  // Test 2: Verifica presenza secret
  if (content.includes('Deno.env.get("FADI_ONE_SECRET")') && content.includes('isAuthenticated(')) {
    console.log("✅ Autenticazione forte Server-Side implementata.");
  } else {
    console.error("❌ ERRORE: Autenticazione FADI_ONE_SECRET mancante.");
    process.exit(1);
  }

  // Test 3: Verifica allowlist
  if (content.includes('switch (action)') || content.includes('switch(action)')) {
    console.log("✅ Allowlist actions implementata tramite switch.");
  } else {
    console.error("❌ ERRORE: Action allowlist mancante.");
    process.exit(1);
  }

  console.log("=== TUTTI I TEST VP-1 SUPERATI CON SUCCESSO ===\n");
}

runTests();
