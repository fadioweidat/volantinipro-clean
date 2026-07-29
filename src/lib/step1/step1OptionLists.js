// Dropdown option lists for Step1's H2H promoter staffing panel and the
// flyer-format picker. Renamed from the source's minified identifiers
// (Bv, Mv, Fv, Nv, Uv) to descriptive names — values/labels unchanged.

export const PROMOTER_COUNT_OPTIONS = [{
  value: 1,
  label: "1 Promoter"
}, {
  value: 2,
  label: "2 Promoter"
}, {
  value: 3,
  label: "3 Promoter"
}, {
  value: 4,
  label: "4 Promoter"
}, {
  value: 5,
  label: "5 Promoter (Team)"
}];

export const PROMOTER_TIME_SLOT_OPTIONS = [{
  value: "07:30-11:30",
  label: "Mattina Presto (7:30 - 11:30)"
}, {
  value: "09:00-13:00",
  label: "Mattina (9:00 - 13:00)"
}, {
  value: "11:30-15:30",
  label: "Pranzo (11:30 - 15:30)"
}, {
  value: "15:00-19:00",
  label: "Pomeriggio (15:00 - 19:00)"
}, {
  value: "18:00-22:00",
  label: "Sera / Aperitivo (18:00 - 22:00)"
}];

export const PROMOTER_SHIFT_DURATION_OPTIONS = [{
  value: 4,
  label: "4 Ore (Mezza giornata)"
}, {
  value: 8,
  label: "8 Ore (Giornata intera)"
}];

export const PROMOTER_LOCATION_TYPE_OPTIONS = [{
  value: "stazione",
  label: "Stazione Treno / Metro"
}, {
  value: "piazza",
  label: "Piazza / Via Principale"
}, {
  value: "centro_commerciale",
  label: "Centro Commerciale (Esterno)"
}, {
  value: "universita",
  label: "Universita / Scuole"
}, {
  value: "fiera_evento",
  label: "Fiera / Evento"
}];

export const FLYER_FORMAT_OPTIONS = [{
  id: "A6",
  label: "A6",
  size: "10x15 cm"
}, {
  id: "A5",
  label: "A5",
  size: "15x21 cm"
}, {
  id: "A4",
  label: "A4",
  size: "21x29 cm"
}, {
  id: "DL",
  label: "DL",
  size: "10x21 cm"
}];
