// Stessi valori di AI_LIMITS in ai-core: qui guidano solo il campo della chat,
// il limite vero lo applica la funzione.
export const ASSISTANT_MAX_MESSAGE = Object.freeze({
  guest: 500,
  driver: 500,
  customer: 1000,
  supplier: 1000,
  admin: 2000,
});
