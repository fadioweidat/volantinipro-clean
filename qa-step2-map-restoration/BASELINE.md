# Step2 map restoration baseline
BASE HEAD: 1b98cf9eab80addc6846ad47cdae7918a689d41b
Historical comparison: 6cf46dd (before simplification), ea8c373 (UI change), c49cfc7 (evidence).
Runtime: anonymous customer, localhost:5176/configuratore?step=2&service=d2d&qty=10000, Chrome 1440x900, Via Antonio Oroboni Milano. Real API, no mocks.
Reproduced before edits: initial, NIL mode and radius 3 km each render ZERO NIL/coverage polygons despite canonical geometry data. See baseline.json/log and screenshots.
Root cause: Step2 render passed [] for mapCoverageZones in Milano client view and filtered zonesWithCoords to only selected NILs. An empty selection therefore had no polygon to click. toggleNilZone additionally rejected removing the last selection.
Historical metric: zonesWithCoords.weightPct and residentialRows.contribution = rounded share of families in the radius. residentialRows.strength is a score out of 100, not a percentage. Municipality display will group Milano NIL family values and reuse residentialRows for the same existing family-share metric. No GIS/coverage/allocation formula changes.
Existing activeMapLayers owns visibility (comuni + a nil visualization key); selected/toggleNilZone remain the only selection source. No duplicate NIL dataset/state.
