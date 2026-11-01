import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../supabase/functions/ai-core/index.ts", import.meta.url), "utf8");

test("every OpenAI call has a response cap", () => {
  assert.equal((source.match(/model: "gpt-4o-mini"/g) || []).length, 7);
  assert.equal((source.match(/max_tokens: OPENAI_MAX_TOKENS/g) || []).length, 7);
});

test("limits per category are declared, anonymous lowest, Admin without a daily total", () => {
  assert.match(source, /anon: \{ perHour: 20, dailyTotal: 300, maxMessage: 500 \}/);
  assert.match(source, /user: \{ perHour: 60, dailyTotal: 1000, maxMessage: 1000 \}/);
  assert.match(source, /admin: \{ perHour: 300, dailyTotal: null, maxMessage: 2000 \}/);
});

test("deterministic and cached answers do not consume messages, the model always does", () => {
  const handler = source.slice(source.indexOf("async function handleQuoteStep("), source.indexOf("async function handleQuoteStep(") + 3000);
  const limits = [...handler.matchAll(/await aiLimitExceeded\(/g)].map((m) => m.index);
  const models = [...handler.matchAll(/await callOpenAi\(/g)].map((m) => m.index);
  assert.equal(limits.length, 2);
  assert.ok(handler.indexOf("deterministicQuoteResponse(") < limits[0]);
  assert.ok(limits[0] < models[0], "anonymous");
  assert.ok(handler.indexOf("cached?.answer") < limits[1], "cache first");
  assert.ok(limits[1] < models[1], "logged in");
});

test("the limit reaches the chat as an answer, not as a generic failure", () => {
  assert.match(source, /json\(\{ answer, status: "limited", code, retryAfterSeconds \}\)/);
  assert.match(source, /if \(metered\) \{\s+const limited = await aiLimitExceeded/);
});
