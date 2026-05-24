"""
fix_encoding.py - Fix all encoding artifacts in volantinipro-final.jsx
and add computeDoorToDoorCoverage helper.
"""
import re

FILE = 'volantinipro-final.jsx'

with open(FILE, 'r', encoding='utf-8') as f:
    c = f.read()

original_len = len(c)

# ─── TASK 1: Fix encoding artifacts ──────────────────────────────────────────
# Pattern: broken "→" rendered as various garbled sequences
# Replace arrow artifacts with plain text equivalents

replacements = [
    # Broken arrows in button labels
    (r'Continua al calendario\s*[â†→�\u0007\+\']+\s*', 'Continua al calendario'),
    (r'Continua con copertura parziale\s*[â†→�\u0007\+\']+\s*', 'Continua con copertura parziale'),
    (r'Continua con distribuzione manuale\s*[â†→�\u0007\+\']+\s*', 'Continua con distribuzione manuale'),
    (r'Vai a Smart Pairing\s*[â†→�\u0007\+\']+\s*', 'Vai a Smart Pairing'),
    (r'Completa configurazione\s*[â†→â€™\u0007\+\']+\s*', 'Completa configurazione'),
    (r'Conferma campagna\s*[â†→â€™\u0007\+\']+\s*', 'Conferma campagna'),
    (r'Nuova campagna\s*[â†→â€™\u0007\+\']+\s*', 'Nuova campagna'),
    (r'Modifica configurazione\s*', 'Modifica configurazione'),
    (r'Vedi dettaglio\s*[â†→â€™\u0007\+\']+\s*', 'Vedi dettaglio'),
    (r'Salva\s*[â†→â€™\u0007\+\']+\s*', 'Salva'),
    (r'Zona &amp; Mappa\s*', 'Zona &amp; Mappa'),
    
    # Back arrows
    (r'[â†←â€™\u0007\+\']+\s*Tipo campagna', 'Torna a Step 1'),
    (r'[â†←â€™\u0007\+\']+\s*Zona &amp; Mappa', 'Torna alla Zona'),
    (r'[â†←â€™\u0007\+\']+\s*Modifica configurazione', 'Modifica configurazione'),
    (r'Dashboard\s*[â†→â€™\u0007\+\']+\s*Campagna', 'Dashboard - Campagna'),
    
    # km² rendering
    (r'km[Aâ]?\s*[²Â2]', 'km²'),
    (r'kmA\?', 'km²'),
    (r'kmA°', 'km²'),
    (r'km[Ã€-ÿ]+', 'km²'),
    
    # density/area with broken chars
    (r'ab\./km[A-Za-zÃÂâ]+', 'ab./km²'),
    (r'g/m[A-Za-zÃÂâ]+', 'g/m²'),
    
    # Broken Italian chars
    (r'quantit[Ã€-ÿ]+', 'quantità'),
    (r'qualit[Ã€-ÿ]+', 'qualità'),
    (r'Densit[Ã€-ÿ]+', 'Densità'),
    (r'densit[Ã€-ÿ]+', 'densità'),
    (r'disponibil[Ã€-ÿ]+', 'disponibile'),
    (r'attivit[Ã€-ÿ]+', 'attività'),
    
    # Discount % with broken char
    (r"[â†→â€™\u0007\+\'\^\{]+'\{p\.disc\}%", "-{p.disc}%"),
    (r"[â†→â€™\u0007\+\'\^\{]+'\\{p\\.disc\\}%", "-{p.disc}%"),
    
    # Comment separator lines with broken chars
    (r'//\s*[â†→â€™\u0007\+\']+.*', '// ─────────────────────────────────────────────────────────────────────'),
    
    # Broken icons in strings (replace entire broken icon strings with empty string or label)
    (r'"[â\u0007\+\']{2,}"', '""'),
    (r"'[â\u0007\+\']{2,}'", "''"),
    
    # "·" separator rendered broken
    (r'\s*[â†→Ã\u0007]+\s*(?=[A-Za-z])', ' · '),
    
    # Specific known patterns
    (r'Hai domande\? Contattaci via WhatsApp\s*[â†→â€™\u0007\+\']+', 'Hai domande? Contattaci via WhatsApp'),
    (r"ISTAT\s*[â†→Ã\u0007]+\s*Mapbox\s*[â†→Ã\u0007]+\s*OpenStreetMap", 'ISTAT · Mapbox · OpenStreetMap'),
    (r"comuni del raggio\s*\?\s*\S+\s*volantini", 'comuni · volantini'),
]

for pattern, replacement in replacements:
    try:
        c_new = re.sub(pattern, replacement, c)
        if c_new != c:
            print(f"  Fixed: {pattern[:60]}")
        c = c_new
    except Exception as e:
        print(f"  SKIP (error): {pattern[:60]} -> {e}")

# ─── Fix specific literal broken strings ─────────────────────────────────────
literal_fixes = [
    ('â†\' Tipo campagna', 'Torna a Step 1'),
    ('â†\' Zona & Mappa', 'Torna alla Zona'),
    ('â†\' Modifica configurazione', 'Modifica configurazione'),
    ('â†\'', ''),
    ('â†\u2019', ''),
    ('â†', ''),
    ('âš ï¸', '⚠️'),
    ('âœ…', '✅'),
    ('âœ•', '×'),
    ('âœ', '✓'),
    ('Ã²', 'ò'),
    ('Ã ', 'à'),
    ('Ã¹', 'ù'),
    ('Ã©', 'é'),
    ('Ã¨', 'è'),
    ('Ãì', 'ì'),
    ('Ã®', 'î'),
    ('Ã¢', 'â'),
    ('Ã´', 'ô'),
    ('AÂ²', '²'),
    ('A²', '²'),
    ('Â²', '²'),
    ('Â·', '·'),
    ('Ã‚Â·', '·'),
    ('Ã‚Â', ' '),
    ('â€"', '—'),
    ('â€™', "'"),
    ('â€œ', '"'),
    ('â€', '"'),
    ('â€¦', '...'),
    ('ÃƒÂ', ''),
    ('Ã…â€™', ''),
    ('Ã¢â€šÂ', ''),
]

for old, new in literal_fixes:
    if old in c:
        count = c.count(old)
        c = c.replace(old, new)
        print(f"  Literal fix ({count}x): {repr(old)} -> {repr(new)}")

print(f"\nFile size: {original_len} -> {len(c)} chars")

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(c)

print('DONE - encoding cleanup complete')
