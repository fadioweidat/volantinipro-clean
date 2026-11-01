import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ASSISTANT_OFF_TEXT, isAssistantOff, markAssistantOffIfNeeded } from "../src/ai/assistantAccess.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("site and ai-core share the same text", () => {
  assert.ok(read("supabase/functions/ai-core/index.ts").includes("const ASSISTANT_OFF_TEXT = " + JSON.stringify(ASSISTANT_OFF_TEXT)));
  assert.match(ASSISTANT_OFF_TEXT, /WhatsApp \+39 351 767 3737/);
  assert.match(ASSISTANT_OFF_TEXT, /info@volantinipro\.it/);
});

test("only a real lack of credit becomes the contact message", () => {
  const source = read("supabase/functions/ai-core/index.ts");
  assert.equal((source.match(/throw await openAiFailure\(res\)/g) || []).length, 7);
  assert.doesNotMatch(source, /if \(!res\.ok\) throw new Error/);
  assert.match(source, /res\.status === 429 && \(body\?\.error\?\.type === "insufficient_quota"/);
});

test("a normal answer leaves the chat on, the no-credit message turns it off", () => {
  assert.equal(markAssistantOffIfNeeded("Risposta normale."), false);
  assert.equal(isAssistantOff(), false);
  assert.equal(markAssistantOffIfNeeded(ASSISTANT_OFF_TEXT), true);
  assert.equal(isAssistantOff(), true);
});

test("the shared chat replaces the form with the contacts", () => {
  const drawer = read("src/components/ai/global/VolantiniProAssistantDrawer.jsx");
  assert.match(drawer, /\{!assistantOff && <form/);
  assert.match(drawer, /\{assistantOff && \(/);
  assert.match(drawer, /Hai domande\? Scrivici/);
  assert.ok(drawer.indexOf("markAssistantOffIfNeeded(response?.text)") < drawer.indexOf("response && response.text"));
});
