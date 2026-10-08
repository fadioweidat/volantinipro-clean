// PV identity belongs to campaignZones, not allocation rows or selectedComuni.
// The explicit mode is persisted by the new Step3 flow. Old drafts lack it,
// so distinct canonical PV IDs independently enforce the defensive guard.
export function blocksLegacyPairing(data) {
  const ids = new Set((Array.isArray(data?.campaignZones) ? data.campaignZones : [])
    .map(z => z?.id).filter(id => typeof id === 'string' && id.trim()));
  return ids.size > 1 || data?.smartPairingMode === 'per_pv';
}

export function selectLegacyPairingSlots(data) {
  return !blocksLegacyPairing(data) && Array.isArray(data?.smartPairingSlots) ? data.smartPairingSlots : [];
}
