// Colore d'identita' del territorio: dipende dal suo id, non da quali altri
// territori sono nel raggio. Bruzzano resta dello stesso colore a 1, 3 o 10 km.
const PALETTE = [
  '#34D399', '#60A5FA', '#C084FC', '#FBBF24', '#FB7185',
  '#2DD4BF', '#A78BFA', '#F97316', '#84CC16', '#38BDF8',
  '#F472B6', '#FACC15', '#818CF8', '#4ADE80', '#FB923C', '#22D3EE',
];

import { NIL_COLORS } from './nilColors.js';

// Costante: se dipendesse dal numero di territori i colori cambierebbero col raggio.
const SHADES = 211;

function hashId(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function shade(index) {
  if (index < PALETTE.length) return PALETTE[index];
  const step = index - PALETTE.length;
  return `hsl(${Math.round(step * 137.508) % 360} ${62 + step % 3 * 10}% ${56 + step % 4 * 5}%)`;
}

function nilColor(id) {
  const match = /^nil_(\d+)(?:__\d+)?$/.exec(String(id));
  return match ? NIL_COLORS[Number(match[1]) - 1] || null : null;
}

// Colore di un singolo territorio, anche fuori dall'elenco del raggio.
export function territoryColor(id) {
  return nilColor(id) || shade(hashId(id) % SHADES);
}

export function assignTerritoryColors(ids) {
  const unique = [...new Set(ids.map(String))].sort();
  const taken = new Set();
  return new Map(unique.map((id) => {
    const fixed = nilColor(id);
    if (fixed) return [id, fixed];
    let index = hashId(id) % SHADES;
    while (taken.has(index)) index = (index + 1) % SHADES;
    taken.add(index);
    return [id, shade(index)];
  }));
}
