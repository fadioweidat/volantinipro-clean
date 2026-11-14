/**
 * Hand to Hand depends on real operating points and promoter assignments, not
 * on the Door to Door family/household coverage formula.
 */
export function canContinueHandToHand({
  hasTerritory = false,
  zoneReady = false,
  pointsFound = 0,
  pointsSelected = 0,
  step1Points = 0,
  radiusMode = false,
  radiusConfirmed = false,
  radiusKm = null,
  radiusCenter = null,
  loading = false,
}) {
  if (!hasTerritory || !zoneReady || loading) return false;
  if (pointsFound > 0 ? pointsSelected < 1 : step1Points < 1) return false;
  if (!radiusMode) return true;
  return Boolean(radiusConfirmed && Number(radiusKm) > 0 &&
    radiusCenter && radiusCenter.lat != null && radiusCenter.lng != null &&
    Number.isFinite(Number(radiusCenter.lat)) && Number.isFinite(Number(radiusCenter.lng)));
}
