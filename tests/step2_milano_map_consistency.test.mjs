import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { geoJsonContainsPoint } from "../src/lib/geo/pointInPolygon.js";
import { haversineKm, pickRealComuneGeometry } from "../src/lib/step2/zoneGeoHelpers.js";

const step2Src = readFileSync(new URL("../src/pages/public/configurator/Step2.jsx", import.meta.url), "utf8");
const mapSrc = readFileSync(new URL("../src/components/Step2Map.jsx", import.meta.url), "utf8");

test("BUG 1 - POI query center uses selectedSearchPoint/address coords instead of defaulting to central Milan", () => {
  assert.ok(step2Src.includes("poiCenterLat = round6("), "poiCenterLat must be defined with round6");
  assert.ok(step2Src.includes("hasSearchPoint ? selectedSearchPoint.lat"), "poiCenterLat must prioritize selectedSearchPoint.lat");
  assert.ok(step2Src.includes("poiEffectiveRadiusKm"), "poiEffectiveRadiusKm must be defined");
  assert.ok(step2Src.includes("usePoi(poiCenterLat, poiCenterLng, poiEffectiveRadiusKm"), "usePoi must consume poiCenterLat/poiCenterLng/poiEffectiveRadiusKm");
});

test("BUG 2 - Radius mode radial sorting prioritizes polygon containing search point and sorts outward", () => {
  const radiusCenter = { lat: 45.5218, lng: 9.1725 };

  const bruzzanoGeom = {
    type: "Polygon",
    coordinates: [[[9.16, 45.51], [9.19, 45.51], [9.19, 45.53], [9.16, 45.53], [9.16, 45.51]]]
  };
  const afforiGeom = {
    type: "Polygon",
    coordinates: [[[9.16, 45.49], [9.19, 45.49], [9.19, 45.51], [9.16, 45.51], [9.16, 45.49]]]
  };

  const zones = [
    { id: "cormano", name: "Cormano", lat: 45.540, lng: 9.170, geometry_geojson: null },
    { id: "bresso", name: "Bresso", lat: 45.538, lng: 9.190, geometry_geojson: null },
    { id: "duomo", name: "Duomo", lat: 45.464, lng: 9.190, geometry_geojson: null, isNil: true },
    { id: "bruzzano", name: "BRUZZANO", lat: 45.5218, lng: 9.1725, geometry_geojson: bruzzanoGeom, isNil: true },
    { id: "affori", name: "AFFORI", lat: 45.505, lng: 9.170, geometry_geojson: afforiGeom, isNil: true }
  ];

  const rLat = Number(radiusCenter.lat);
  const rLng = Number(radiusCenter.lng);
  const nilRows = zones.filter(z => z.isNil);
  const comuneRows = zones.filter(z => !z.isNil);

  const sortFn = (a, b) => {
    const aGeom = pickRealComuneGeometry(a);
    const bGeom = pickRealComuneGeometry(b);
    const aContains = aGeom ? geoJsonContainsPoint(aGeom, rLat, rLng) : false;
    const bContains = bGeom ? geoJsonContainsPoint(bGeom, rLat, rLng) : false;
    if (aContains && !bContains) return -1;
    if (!aContains && bContains) return 1;

    const aCoords = (Number.isFinite(Number(a?.lat)) && Number.isFinite(Number(a?.lng)))
      ? { lat: Number(a.lat), lng: Number(a.lng) }
      : { lat: 45.464, lng: 9.190 };
    const bCoords = (Number.isFinite(Number(b?.lat)) && Number.isFinite(Number(b?.lng)))
      ? { lat: Number(b.lat), lng: Number(b.lng) }
      : { lat: 45.464, lng: 9.190 };
    const aDist = aCoords ? haversineKm(rLat, rLng, aCoords.lat, aCoords.lng) : 9999;
    const bDist = bCoords ? haversineKm(rLat, rLng, bCoords.lat, bCoords.lng) : 9999;
    return aDist - bDist;
  };

  nilRows.sort(sortFn);
  comuneRows.sort(sortFn);
  const filtered = [...nilRows, ...comuneRows];

  assert.strictEqual(filtered[0].id, "bruzzano", "Bruzzano containing the point must be #1 priority");
  assert.strictEqual(filtered[1].id, "affori", "Affori must be #2 (nearest Milano NIL)");
  assert.ok(filtered.findIndex(z => z.id === "cormano") >= 3, "Cormano must come after Milano NILs as secondary external comune");
  assert.ok(step2Src.includes("filtered = [...nilRows, ...comuneRows.slice(0, maxComuni)];"), "Step2.jsx must place nilRows before comuneRows in radius mode");
});

test("BUG 3 - Step2Map renders outer Milano boundary with strong contrast and internal 88 NILs with visible thin boundaries", () => {
  assert.ok(mapSrc.includes("isMilanoCityMapForBoundary ? 2.8 : 2"), "Outer Milano boundary must have weight 2.8");
  assert.ok(mapSrc.includes("isMilanoCityMapForBoundary ? 'transparent' : col"), "Outer Milano boundary must have transparent fill to not obscure internal NILs");
  assert.ok(mapSrc.includes("weight: isNilZone ? 1.1 : 0.9"), "NIL polygons must have visible border weight 1.1");
  assert.ok(mapSrc.includes("opacity: isNilZone ? 0.60 : 0.45"), "NIL polygons must have opacity 0.60 for clear demarcation");
  assert.ok(mapSrc.includes("pane: 'nilPolygonsPane'"), "NIL polygons must be on nilPolygonsPane");
  assert.ok(mapSrc.includes("pane: 'poiSelectionPane'"), "POI markers must be on poiSelectionPane");
});
