import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../volantinipro-final.jsx", import.meta.url), "utf8");
const areaSwitch = readFileSync(new URL("../src/components/customer/AdminAreaSwitch.jsx", import.meta.url), "utf8");

test("il Cliente con ruolo Admin confermato puo' passare ad Admin senza logout", () => {
  assert.match(main, /session && <AdminAreaSwitch onNav=\{onNav\}/);
  assert.match(areaSwitch, /restoreSupabaseSession\(\)/);
  assert.match(areaSwitch, /verifySupabaseAdminRole\(session\)/);
  assert.match(areaSwitch, /if \(!allowed\) return null/);
  assert.match(areaSwitch, /onClick=\{\(\) => onNav\("admin"\)\}/);
});

test("il cambio area non assegna ruoli, non scrive il database e non bypassa AdminGuard", () => {
  assert.doesNotMatch(areaSwitch, /\.update\(|\.insert\(|service_role|raw_app_meta_data/);
  assert.doesNotMatch(areaSwitch, /localStorage\.setItem|sessionStorage\.setItem/);
  const router = readFileSync(new URL("../src/app/AppRouter.jsx", import.meta.url), "utf8");
  assert.match(router, /<AdminGuard onNav=\{goTo\}>/);
});

test("un magic link richiesto per Admin non degrada a Cliente se la verifica ruolo fallisce", () => {
  const callback = main.slice(main.indexOf("const loginIntentIsAdmin = isAdminContext"), main.indexOf("const pendingReturnToStep4"));
  assert.match(callback, /if \(isAdmin && loginIntentIsAdmin\)\s*\{\s*onNav\("admin"\)/);
  assert.match(callback, /if \(loginIntentIsAdmin\)\s*\{[\s\S]*setAuthError\(/);
});
