import { handleBusinessCommerce } from './service.ts';
Deno.serve(request => handleBusinessCommerce(request));
