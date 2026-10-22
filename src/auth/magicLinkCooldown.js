// After a magic link request (sent, slow, or rate-limited) the button stays
// locked for 60 s: every new request invalidates the previous email's link,
// so a quick retry would leave the customer holding a dead link. The lock is
// kept in localStorage so a page reload does not reopen the window.
export const MAGIC_LINK_COOLDOWN_MS = 60000;
export const MAGIC_LINK_COOLDOWN_KEY = "vp_magic_link_cooldown_until";

export function readMagicLinkCooldown(storage, now = Date.now()) {
  try {
    const until = Number(storage?.getItem(MAGIC_LINK_COOLDOWN_KEY) || 0);
    // A value further away than one cooldown is corrupt or from a changed clock.
    return Number.isFinite(until) && until > now && until - now <= MAGIC_LINK_COOLDOWN_MS ? until : 0;
  } catch {
    return 0;
  }
}

export function startMagicLinkCooldown(storage, now = Date.now()) {
  const until = now + MAGIC_LINK_COOLDOWN_MS;
  try { storage?.setItem(MAGIC_LINK_COOLDOWN_KEY, String(until)); } catch {}
  return until;
}

export function magicLinkCooldownSeconds(until, now = Date.now()) {
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}
