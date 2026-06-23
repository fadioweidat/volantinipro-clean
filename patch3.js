const fs = require('fs');

try {
  let content = fs.readFileSync('volantinipro-final.jsx', 'utf8');

  // 1. Smart Pairing box
  content = content.replace(
    /"Smart Pairing: non trovi la data desiderata\? Invia comunque la richiesta\. Ti avvisiamo quando siamo operativi nella tua zona o nelle vicinanze\."/g,
    '"Smart Pairing: non trovi la data desiderata? Invia comunque la richiesta. Ti avvisiamo quando siamo operativi nella tua zona o vicino."'
  );

  // 2. Nota zone
  content = content.replace(
    'Potrai aggiungere una o più zone nel passaggio Zona & Mappa.',
    "Potrai aggiungere una o più zone nel passaggio \\'Zona e Mappa\\'."
  );

  // 3. Tipo attività cliente
  content = content.replace(
    'children:"Serve per adattare suggerimenti, zone e orari al tipo di attività pubblicizzata."',
    'children:[_jsx("span",{style:{color:C.orange,fontWeight:700,marginRight:6},children:"Opzionale ma consigliato."}),"Serve per adattare suggerimenti, zone e orari al tipo di attività pubblicizzata."]'
  );

  // 4. Compattare card servizi
  content = content.replace('padding: 22px 18px;', 'padding: 18px 16px;');
  content = content.replace('min-height: 320px;', 'min-height: 280px;');

  // Spazio tra descrizione e checklist
  content = content.replace(/marginBottom:18\},children:P/g, 'marginBottom:14},children:P');
  content = content.replace('gap:10,marginBottom:24},children:J.map', 'gap:8,marginBottom:18},children:J.map');

  // 5. Leggibilità & 6. Riepilogo configurazione
  content = content.replace('fontSize:9,color:"rgba(255,255,255,.6)"', 'fontSize:10,color:"rgba(255,255,255,.7)"');
  content = content.replace('fontSize:12,color:"rgba(255,255,255,.72)"', 'fontSize:13,color:"rgba(255,255,255,.85)"');
  content = content.replace('fontSize:12,color:"rgba(255,255,255,.72)"', 'fontSize:13,color:"rgba(255,255,255,.85)"');
  content = content.replace('fontSize:13,color:C.white', 'fontSize:14,color:C.white');
  content = content.replace('fontSize:11,lineHeight:1.45,color:"rgba(255,255,255,.7)"', 'fontSize:12,lineHeight:1.5,color:"rgba(255,255,255,.85)"');

  // Also enhance section subtitle legibility
  // Current: .vp-s1-subtitle { font-family: 'DM Sans', Inter, system-ui, sans-serif; font-size: 16px; color: rgba(255,255,255,0.6); max-width: 600px; line-height: 1.6; }
  content = content.replace('color: rgba(255,255,255,0.6); max-width: 600px;', 'color: rgba(255,255,255,0.85); max-width: 600px;');

  fs.writeFileSync('volantinipro-final.jsx', content);
  console.log("Patch applied successfully!");
} catch (e) {
  console.error("Error patching file:", e);
}
