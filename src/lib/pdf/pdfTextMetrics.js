// Larghezze dei caratteri dei font standard PDF usati dal preventivo
// (Helvetica = F1, Helvetica-Bold = F2), in millesimi di em, dalle metriche
// AFM Adobe standard. Servono ad andare a capo in base alla larghezza reale
// del testo, non al numero di caratteri (2026-11-05).

const ASCII_FROM = 32; // spazio
// Codici 32..126
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
// Caratteri non ASCII presenti nei testi del preventivo (WinAnsi).
const EXTRA = {
  F1: { "€": 556, "·": 278, "²": 333, "’": 222, "‘": 222, "“": 333, "”": 333, "•": 350, "°": 400, " ": 278 },
  F2: { "€": 556, "·": 278, "²": 333, "’": 278, "‘": 278, "“": 500, "”": 500, "•": 350, "°": 400, " ": 278 },
};

function baseLetter(ch) {
  // lettere accentate: stessa larghezza della lettera di base (AFM Helvetica)
  const b = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return b.length === 1 ? b : ch;
}

export function charWidth(ch, font = "F1") {
  const table = font === "F2" ? HELVETICA_BOLD : HELVETICA;
  const extra = EXTRA[font === "F2" ? "F2" : "F1"];
  if (extra[ch] != null) return extra[ch];
  let code = ch.codePointAt(0);
  if (code < ASCII_FROM || code > 126) {
    const b = baseLetter(ch);
    code = b.codePointAt(0);
  }
  if (code >= ASCII_FROM && code <= 126) return table[code - ASCII_FROM];
  return 556; // carattere medio
}

/** Larghezza in punti di `text` al corpo `size`. */
export function textWidth(text, size, font = "F1") {
  let w = 0;
  for (const ch of String(text ?? "")) w += charWidth(ch, font);
  return (w * size) / 1000;
}

/**
 * Divide `text` in righe larghe al massimo `maxWidth` punti. Le parole piu'
 * lunghe della colonna vengono spezzate (mai testo oltre il bordo).
 */
export function wrapToWidth(text, maxWidth, size, font = "F1") {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  const fits = s => textWidth(s, size, font) <= maxWidth;
  const pushLongWord = word => {
    let part = "";
    for (const ch of word) {
      if (part && !fits(part + ch)) { lines.push(part); part = ch; } else part += ch;
    }
    return part;
  };
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) { line = next; continue; }
    if (line) lines.push(line);
    line = fits(word) ? word : pushLongWord(word);
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
