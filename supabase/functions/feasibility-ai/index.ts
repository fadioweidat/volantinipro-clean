import { handleCommerce } from '../feasibility-commerce/service.ts';
// The Phase 2 prompt/engine remain unchanged; this gate enforces quota and preview-only access.
Deno.serve(request=>handleCommerce(request,true));
