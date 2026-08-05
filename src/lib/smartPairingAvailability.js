export function normalizeSmartPairingAvailability(payload) {
  const availableDates = Array.isArray(payload?.availableDates)
    ? payload.availableDates.filter(row => row && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) && Number(row.placesAvailable) > 0)
    : [];
  const smartPairingSlots = Array.isArray(payload?.smartPairingSlots)
    ? payload.smartPairingSlots.filter(row => row && /^\d{4}-\d{2}-\d{2}$/.test(String(row.date)) && Number(row.placesAvailable) > 0)
    : [];
  return {
    availableDates,
    smartPairingSlots,
    source: payload?.source === "campaign_capacity" ? "campaign_capacity" : "none"
  };
}

export async function fetchSmartPairingAvailability(client, context) {
  if (!client?.functions?.invoke) throw new Error("SMART_PAIRING_BACKEND_NOT_CONFIGURED");
  const { data, error } = await client.functions.invoke("smart-pairing-availability", { body: context });
  if (error) throw new Error(error.message || "SMART_PAIRING_AVAILABILITY_FAILED");
  return normalizeSmartPairingAvailability(data);
}

export function calendarDateKey(year, zeroBasedMonth, day) {
  return `${year}-${String(zeroBasedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isSelectableCalendarDate(date, availableDates, pair) {
  const today = new Date().toISOString().slice(0, 10);
  if (!date || date < today) return false;
  if (pair && Number(pair.placesAvailable ?? 1) > 0) return true;
  return availableDates instanceof Set && availableDates.has(date);
}
