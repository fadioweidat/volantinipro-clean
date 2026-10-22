import { useCallback, useEffect, useState } from "react";
import { magicLinkCooldownSeconds, readMagicLinkCooldown, startMagicLinkCooldown } from "./magicLinkCooldown.js";

const storage = () => (typeof window === "undefined" ? null : window.localStorage);

/**
 * Countdown for the magic link button. Only a display ticker: it never sends
 * a request (LoginPage keeps the single, submit-only signInWithOtp call).
 */
export function useMagicLinkCooldown() {
  const [until, setUntil] = useState(() => readMagicLinkCooldown(storage()));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!(until > Date.now())) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  const lock = useCallback(() => {
    const at = Date.now();
    setNow(at);
    setUntil(startMagicLinkCooldown(storage(), at));
  }, []);
  const isLocked = useCallback(() => magicLinkCooldownSeconds(until, Date.now()) > 0, [until]);
  return { cooldownSeconds: magicLinkCooldownSeconds(until, now), isLocked, lock };
}
