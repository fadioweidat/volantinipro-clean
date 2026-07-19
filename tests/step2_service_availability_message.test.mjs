import assert from "node:assert/strict";
import { getStep2ServiceAvailabilityMessage } from "../src/lib/step2/serviceAvailabilityMessage.js";

const poiTimeout = getStep2ServiceAvailabilityMessage("poi", "OVERPASS_TIMEOUT");
assert.match(poiTimeout, /punti di interesse/i);
assert.match(poiTimeout, /tempo massimo/i);
assert.doesNotMatch(poiTimeout, /OVERPASS_TIMEOUT/);

const poiRateLimit = getStep2ServiceAvailabilityMessage("poi", "OVERPASS_HTTP_429");
assert.match(poiRateLimit, /limitando temporaneamente/i);

const transportUnavailable = getStep2ServiceAvailabilityMessage("transport", "TRANSPORT_HTTP_503");
assert.match(transportUnavailable, /fermate di trasporto/i);
assert.match(transportUnavailable, /temporaneamente non disponibile/i);
assert.doesNotMatch(transportUnavailable, /TRANSPORT_HTTP_503/);

assert.equal(getStep2ServiceAvailabilityMessage("poi", null), null);
assert.equal(getStep2ServiceAvailabilityMessage("unknown", "ERROR"), null);

console.log("Step 2 service availability messages: PASS");
