import { createHandler } from './handler.js';

Deno.serve(createHandler({
  apiKey: Deno.env.get('OPENAI_API_KEY'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  model: Deno.env.get('FEASIBILITY_OPENAI_MODEL') || 'gpt-4o-mini',
}));
