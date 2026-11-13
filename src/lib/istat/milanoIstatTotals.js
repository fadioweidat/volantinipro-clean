// Milano intera: dato ufficiale ISTAT del comune (015146), unica cifra per
// pagina SEO, calcolatore homepage, Preventivo Rapido e relativo PDF.
// Fonte: ISTAT, Bilancio demografico e popolazione residente al 31 dicembre
// 2024 (P2_2024_it_Comuni.csv, riga 015146): popolazione 1.365.698, famiglie
// 741.887. Superficie e densita' dai confini ISTAT al 1° gennaio 2026.
//
// Perche' non la somma dei NIL: analysis-istat ripartisce il totale ISTAT sui
// 88 NIL in proporzione alla superficie e i confini NIL (PGT 2030) superano il
// confine ISTAT di circa lo 0,3%, quindi la somma dei NIL (744.299) non e' un
// dato ISTAT. Lo Step 2 usa ancora la somma dei NIL finche' non viene
// corretta la ripartizione nel database (lavoro separato).

export const MILANO_ISTAT_CODE = "015146";
export const MILANO_NIL_COUNT = 88;
export const FLYERS_PER_HOUSEHOLD = 1.1;

export const MILANO_ISTAT_HOUSEHOLDS = 741887;
export const MILANO_ISTAT_POPULATION = 1365698;
export const MILANO_ISTAT_AREA_KM2 = 181.17;
export const MILANO_ISTAT_DENSITY_PER_KM2 = 7538.2;

/** famiglie x 1,1 sul totale del comune: 816.076 (stesso calcolo della pagina SEO). */
export const MILANO_ISTAT_RECOMMENDED_FLYERS = Math.round(MILANO_ISTAT_HOUSEHOLDS * FLYERS_PER_HOUSEHOLD);
