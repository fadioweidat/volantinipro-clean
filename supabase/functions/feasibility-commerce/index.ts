import { handleCommerce } from './service.ts';
Deno.serve(request=>handleCommerce(request));
