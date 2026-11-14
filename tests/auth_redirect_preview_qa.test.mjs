import test from "node:test";
import assert from "node:assert/strict";
import { selectAuthRedirectOrigin } from "../src/lib/authRedirectOrigin.js";
import { buildAuthCallbackPath } from "../src/auth/loginIntent.js";

const preview = "https://volantinipro-git-preview-qa-fenicesp-gmailcoms-projects.vercel.app";
const prod = "https://www.volantinipro.it";

test("Admin magic link resta sull'URL fisso preview-qa anche con URL pubblico di produzione", () => {
  const base = selectAuthRedirectOrigin({ currentOrigin: preview, configuredOrigin: prod, isDev: false });
  assert.equal(`${base}${buildAuthCallbackPath("admin")}`, `${preview}/auth/callback?context=admin`);
});

test("la produzione mantiene l'URL pubblico configurato", () => {
  assert.equal(selectAuthRedirectOrigin({ currentOrigin: prod, configuredOrigin: prod, isDev: false }), prod);
});

test("l'URL del singolo deploy non sostituisce l'URL pubblico configurato", () => {
  const deploy = "https://volantinipro-abc123-fenicesp-gmailcoms-projects.vercel.app";
  assert.equal(selectAuthRedirectOrigin({ currentOrigin: deploy, configuredOrigin: prod, isDev: false }), prod);
});

test("un host che somiglia a preview-qa ma non e' vercel.app non viene accettato", () => {
  const spoof = "https://volantinipro-git-preview-qa-example.vercel.app.evil.test";
  assert.equal(selectAuthRedirectOrigin({ currentOrigin: spoof, configuredOrigin: prod, isDev: false }), prod);
});

test("il dev server conserva il proprio origin", () => {
  const local = "http://localhost:5173";
  assert.equal(selectAuthRedirectOrigin({ currentOrigin: local, configuredOrigin: prod, isDev: true }), local);
});
