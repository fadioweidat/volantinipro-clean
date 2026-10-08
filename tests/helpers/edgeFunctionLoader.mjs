// Node module hooks that let tests import a Supabase Edge Function's index.ts
// unchanged: the two remote Deno imports are replaced by local shims. The
// handler passed to serve() and the createClient factory are exposed through
// globals that tests/helpers/submitCampaignHarness.mjs controls.
const SHIMS = {
  "https://deno.land/std@0.168.0/http/server.ts":
    "export function serve(handler) { globalThis.__edgeHandler = handler; }",
  "https://esm.sh/@supabase/supabase-js@2.21.0":
    "export function createClient(...args) { return globalThis.__edgeCreateClient(...args); }",
};

export async function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(SHIMS, specifier)) {
    return { url: `data:text/javascript,${encodeURIComponent(SHIMS[specifier])}`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
