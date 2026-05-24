import sys

with open('volantinipro-final.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

marker = 'disabled={!canGo}'
idx = c.find(marker)
if idx == -1:
    print('MARKER NOT FOUND'); sys.exit(1)

end = c.find('</button>', idx) + len('</button>')
print('OLD snippet:', repr(c[idx:idx+80]))

new_block = (
    'disabled={searchMode === "cap" ? selectedCaps.length === 0 : !canGo}\r\n'
    '              style={{\r\n'
    '                width: "100%", padding: "13px", borderRadius: 11, border: "none",\r\n'
    '                background: (searchMode === "cap" ? selectedCaps.length > 0 : canGo) ? col : "rgba(255,255,255,.1)", color: C.white,\r\n'
    '                fontFamily: F.sans, fontSize: 14, fontWeight: 700, cursor: (searchMode === "cap" ? selectedCaps.length > 0 : canGo) ? "pointer" : "not-allowed",\r\n'
    '                boxShadow: (searchMode === "cap" ? selectedCaps.length > 0 : canGo) ? `0 6px 20px ${C.orangeGlow}` : "none"\r\n'
    '              }}>\r\n'
    '              {searchMode === "cap"\r\n'
    '                ? (selectedCaps.length > 0 ? `Continua con ${selectedCaps.length} CAP \u2192` : "Seleziona almeno un CAP")\r\n'
    '                : canGo ? (isResidentialStep2 || isBusinessStep2 || isMovementStep2 ? (coverageStatus === "insufficient" ? "Continua con copertura parziale \u2192" : "Continua al calendario \u2192") : "Vai a Smart Pairing \u2192") : "Seleziona almeno una zona"}\r\n'
    '            </button>'
)

c2 = c[:idx] + new_block + c[end:]
with open('volantinipro-final.jsx', 'w', encoding='utf-8') as f:
    f.write(c2)
print('DONE')
