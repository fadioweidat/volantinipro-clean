const fs = require('fs');

try {
  let content = fs.readFileSync('volantinipro-final.jsx', 'utf8');

  // 1. Sottotitolo pagina
  content = content.replace('"Scegli servizio, quantità e periodo. Il prezzo finale dipende da zona, copertura e opzioni selezionate."', '"Scegli servizio, quantità e periodo. Nel passaggio successivo calcoli zona, copertura e raggio sulla mappa."');

  // 2. Smart Pairing box
  // Banner is already updated from previous patch. Let's make sure.
  content = content.replace('"Smart Pairing: non trovi la data desiderata? Invia comunque la richiesta. Ti avvisiamo quando siamo operativi nella tua zona o nelle vicinanze."', '"Smart Pairing: non trovi la data desiderata? Invia comunque la richiesta. Ti avvisiamo quando siamo operativi nella tua zona o nelle vicinanze."');
  
  // Date section repetition removal
  content = content.replace(':"Smart Pairing: non trovi la data desiderata? Invia comunque la richiesta. Ti avvisiamo quando siamo operativi nella tua zona o nelle vicinanze."})', ':"Il periodo selezionato è indicativo. Potrai sempre modificarlo nello Step 3."})');

  // 3. Aggiungi altra zona / comune
  content = content.replace(/function Step1ZoneCountSelector[\s\S]*?function makeOperationalZone/, `function Step1ZoneCountSelector({ setData }) {
  return (
    <div style={{ marginTop: 8, marginBottom: 24 }}>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "rgba(255,255,255,.8)", margin: 0, padding: "12px 16px", background: "rgba(255,255,255,.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,.08)" }}>
        Potrai aggiungere una o più zone nel passaggio Zona & Mappa.
      </p>
    </div>
  );
}
function makeOperationalZone`);

  // 4. Tipo attività cliente
  content = content.replace('"Aiuta il sistema a suggerire zone, orari e target più adatti."', '"Serve per adattare suggerimenti, zone e orari al tipo di attività pubblicizzata."');

  // 5. Compattare layout
  content = content.replace('.vp-s1-card-inner { background: #0A0D14; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 24px; }', '.vp-s1-card-inner { background: #0A0D14; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 18px 20px; }');
  content = content.replace('.vp-s1-card { background: #0A0D14; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 24px 20px; cursor: pointer; position: relative; overflow: hidden; display: flex; flex-direction: column; min-height: 380px; transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease; }', '.vp-s1-card { background: #0A0D14; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 22px 18px; cursor: pointer; position: relative; overflow: hidden; display: flex; flex-direction: column; min-height: 320px; transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease; }');
  
  // Section margins
  content = content.replace('id:"section-servizio",style:{marginBottom:32}', 'id:"section-servizio",style:{marginBottom:24}');
  content = content.replace(/style:\{marginBottom:16\}/g, 'style:{marginBottom:14}');
  content = content.replace('id:"section-piano",className:"vp-s1-card-inner",style:{marginBottom:24}', 'id:"section-piano",className:"vp-s1-card-inner",style:{marginBottom:18}');

  // 6. Leggibilità testi piccoli
  content = content.replace('fontSize:15,color:"rgba(255,255,255,.9)",lineHeight:1.6,marginBottom:20},children:P', 'fontSize:15,color:"rgba(255,255,255,.9)",lineHeight:1.55,marginBottom:18},children:P'); // Descrizioni servizi (was modified in last patch so we refine it)
  content = content.replace('fontSize:14,color:"rgba(255,255,255,.8)",lineHeight:1.45},children:ge', 'fontSize:14,color:"rgba(255,255,255,.85)",lineHeight:1.5},children:ge'); // Checklist
  content = content.replace('fontSize:13,color:"rgba(255,255,255,.8)",marginBottom:12},children:"Serve per adattare', 'fontSize:13,color:"rgba(255,255,255,.9)",marginBottom:12},children:"Serve per adattare');
  content = content.replace(/fontSize:12,color:"rgba\(255,255,255,\.75\)"\},children:P/g, 'fontSize:13,color:"rgba(255,255,255,.8)"},children:P'); // Sub texts
  content = content.replace(/fontSize:12,color:"rgba\(255,255,255,\.8\)",display:"block"/g, 'fontSize:13,color:"rgba(255,255,255,.9)",display:"block"'); // Labels

  // 7. Progress bar
  content = content.replace('fontSize: 13, fontWeight: active ? 700 : 500, color: active ? C.white : "rgba(255,255,255,.52)"', 'fontSize: 14, fontWeight: active ? 800 : 600, color: active ? C.white : "rgba(255,255,255,.7)"');

  fs.writeFileSync('volantinipro-final.jsx', content);
  console.log("Patch applied successfully!");
} catch (e) {
  console.error("Error patching file:", e);
}
