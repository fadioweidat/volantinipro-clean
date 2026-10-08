# Phase 3B.1: per-PV Smart Pairing domain engine

Pure, unused by the live UI. No requests, clock reads, storage, reservations,
base-price formulas or geography matching are implemented here.

## Inputs and lifecycle

1. Read canonical `campaignZones[]`; each PV must have a unique nonempty `id`.
2. Call `buildPairingContext(zone, {service, period: {start, end}, mappingPolicyVersion})`.
   IDs, canonical municipality/NIL/CAP/radius identity, coordinates, period and
   mapping policy form the deterministic signature. Display names, quantity,
   array order and active PV are excluded. Missing coordinates remain null;
   invalid/partial coordinates invalidate the context. Radius requires a center.
3. Call `beginPairingRequest(context, generation)` with an increasing positive
   generation. New requests start without verified slots. Error, unavailable,
   skipped and stale states can be created explicitly with the same function.
4. The future orchestration layer must verify transport and territory mapping,
   then call `applyPairingResponse` with the request PV ID, generation and
   signature, payload, `now` and `expiresAt` in epoch milliseconds.
   Expiry is caller policy; this engine invents no TTL. Only a currently loading
   owner can accept a response. Deleted PVs are pruned and late/replayed/foreign
   responses are rejected. No mutation is made to canonical input or prior state.
5. Supply existing pricing output `[{id, distributionPrice}]` independently of
   availability, recomputed from current quantity/territory whenever economics
   change. `calculateCampaignPairing` rechecks contexts against current PVs,
   generations, verification timestamps, selected dates and slot validity.

`verified: true` is an explicit caller attestation, not proof created by this
module and not a cryptographic/server-authorized price. The current city-only
availability endpoint is insufficient to attest precise NIL/CAP/radius mapping.
Do not set that flag merely because a city name matches or because cached data
exists. Phase 3B.2 must define and test the mapping/transport boundary.

## Eligibility and money

Only backend-source `campaign_capacity` slots with positive capacity, type
`same` and exactly 40%, or type `nearby` and exactly 20%, may qualify. A verified
current match plus one valid selected date within the context period is needed.
No match, loading, unavailable, error, stale, skipped, missing/expired verification,
ambiguous duplicate slots and unsupported rates produce zero discount.

Per PV: `discount = roundMoney(base * eligiblePercent / 100)` using the existing
distribution pricing helper; campaign base/discount are summed as integer cents;
net is base minus discount. A deleted PV contributes neither base nor discount.
Malformed/missing base prices and duplicate IDs throw rather than fabricate totals.
There is no urgency, subscription, printing or extra-service recomputation here.

## Multiple dates and legacy compatibility

Supported policies are `single_date_only` (default) and `disabled`.
Multiple distinct selected dates under the default return zero discount and
`policyDecisionRequired: true`. Unknown policies fail closed. Duplicate selection
of the same date counts once. No volume allocation or date-average policy exists.

Legacy Step3/Step4 average positive selected-date percentages and apply one rate
to campaign base. That behavior is intentionally NOT reproduced. In particular,
selecting same + nearby dates does not silently yield 30%. The legacy UI remains
unchanged because it does not import this engine. Future wiring requires explicit
date-policy approval, backend matching clarification and Step3/Step4/payload gates.

## Limits and next phase

Response slots do not reserve capacity (`reservesCapacity: false`). Concurrent
request scheduling, cancellation, refresh, cache eviction, retry and UI copy belong
to the future orchestration layer. It must allocate monotonic generations, pass
current timestamps and use only current economic inputs. No live price change is
authorized by adding this module.

Targeted tests cover actual existing territorial price output, 1/2/5 PV, mixed
states, deletion, reorder, active-PV independence, stale ownership, invalid contexts,
cent sums, input immutability and deliberately incorrect calculation fixtures.
Protected source files are compared with approved baseline 047a764; live behavior
is not claimed to be fixed or newly wired by these domain tests.
