with open('volantinipro-final.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

checks = [
    ('CAP mode selZones', 'searchMode === "cap"'),
    ('handleCapSelect fallback', 'localZone = {'),
    ('Radius hidden in CAP', 'searchMode !== "cap" && ('),
    ('CAP chips in topbar', 'CAP selezionati:'),
    ('CAP section header', 'CAP selezionati'),
    ('areaMode in payload', 'areaMode: isCapMode'),
    ('CTA CAP mode', 'Continua con'),
    ('No auto comuni in CAP', 'Solo i CAP selezionati'),
    ('Modalita CAP badge', 'Modalit'),
    ('Summary CAP label', 'Modalit'),
]

print('=== Verification ===')
for name, fragment in checks:
    found = fragment in c
    print(f'  [{"OK" if found else "MISSING"}] {name}')
