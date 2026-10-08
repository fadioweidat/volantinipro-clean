# Phase3B.2 — provisional Step3 orchestration and defensive Step4 guard

Production base: 047a764. Feature ancestry: Phase3B.1 55c0bb2.

## Legacy consumers and compatibility boundary

Previously Step3 published global availableDates, smartPairingSlots, date unions,
averagePairingDiscount/avgDiscount and pairingDiscountPercent. Step3 panels used
them for calendars/claims; Step4 reconstructed pairs and one global discount for
pricing, calendar, summary, PDF-facing planning/pricing and submission-facing data.
AppRouter persisted the full draft and restored history snapshots; service reset
cleared global planning fields. Those router/reset/persistence files are unchanged.

Step4 now selects slots through one central guard. More than one distinct canonical
campaignZones[].id OR explicit smartPairingMode=per_pv blocks legacy slots. Allocation
rows and selectedComuni do not count as PVs. The derived pairs/discount therefore
become empty/zero for ALL downstream consumers, not just displayed text. Old drafts
without a mode flag are guarded by PV IDs. Genuine single-PV legacy entry, including
one PV covering multiple territories, keeps its existing behavior. No price formula,
PDF module, payload builder or submission logic changed.

New Step3 configured D2D canonical PVs explicitly enter per_pv mode. A single PV
using this new flow gets the same provisional, zero-discount treatment as multiple
PVs; this is disclosed in the UI, not silently presented as a confirmed discount.
Legacy/non-D2D paths remain in LegacyStep3. Base quantity/price summary is reused.

## Ownership, lifecycle and transport

The coordinator uses the Phase3B.1 context, request state, ownership and response
acceptance functions. Each PV has its own monotonic generation and context signature.
Default concurrency is two (configurable 1–5); SDK invoke supports AbortSignal and
uses a 15-second timeout. Abort is backed by independent ownership/generation checks.
Reorder does not refetch or transfer results. Deletion aborts/removes state and prunes
owned preferences; context/period changes invalidate current observations. Refresh
restores only per-ID date preferences, never verified states or global cached slots.
Expiry defaults to five minutes (technical, configurable); expired observations are
stale until retried. Retry addresses one PV; failures leave other PV states intact.

Only one canonical parent can be queried using the current API. Missing coordinates
are omitted; null is never sent as a fabricated zero center. Multiple-parent or invalid
contexts are unavailable. The API transport can report candidate matches/no-match,
but EVERY successful name-only response remains domain unavailable/unverified with
reason territory_unverified. Observations and preferred dates are separate from
economic domain slots, which remain empty. The domain eligibility function yields 0%.

## Backend limitation and dates

Live availability function v10 reads campaigns and matches city/zone names or centers;
it does not provide precise NIL/CAP/radius/PV mapping or reservations. A 200 response
does not attest territorial eligibility. No backend, schema or deployed setting changed.

The owner-specific month view selects preferences only; there is no shared calendar
claiming compatibility for all PVs. Multiple dates retain the Phase3B.1 fail-closed
policy; no volume allocation or mean discount is invented. Continue without pairing
and continue with preferences both publish no global slots or discounts. Preferences
may remain for later review, but cannot create a Step4 discount.

## Evidence and remaining gates

Focused guard/domain/coordinator tests cover 1/2/5 PV, direct entry and persisted/history
snapshots, cents, mixed response states, retry, deletion, reorder, abort/late responses,
changed territory/period and refresh. Browser tests import actual Step3/Step4 with an
injected read-only mock transport; external requests are blocked, no forms submitted.
This tests UI/async correctness, not production geographic eligibility. Backend mapping
assumptions were verified separately by reading the deployed function.

Phase3B.3 may consume shared per-PV pricing only after defining a stronger backend
matching/verification contract and multiple-date policy. This phase does NOT establish
end-to-end economic eligibility, reserve capacity or deploy anything.
