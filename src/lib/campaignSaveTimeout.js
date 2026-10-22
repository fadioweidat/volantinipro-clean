// Step 4 "Conferma": submit-campaign-request had no client limit, so a slow
// database left "Salvataggio in corso..." on screen with no end. After 10 s the
// customer is told it is taking longer; after 60 s the wait stops with a clear
// message. A retry is safe: the Edge Function returns the campaign already
// created when the same request (same email, comune, quantity, amount, zones)
// arrives again within 10 minutes (submission fingerprint).
export const CAMPAIGN_SAVE_SLOW_NOTICE_MS = 10000;
export const CAMPAIGN_SAVE_TIMEOUT_MS = 60000;
export const CAMPAIGN_SAVE_TIMEOUT_CODE = "campaign_save_timeout";
export const CAMPAIGN_SAVE_SLOW_MESSAGE = "Il salvataggio sta richiedendo più del solito. Non chiudere la pagina.";
export const CAMPAIGN_SAVE_TIMEOUT_MESSAGE = "Il server non ha confermato il salvataggio entro 60 secondi. La richiesta potrebbe essere comunque arrivata: premi di nuovo «Conferma». Se era già stata salvata non verrà duplicata.";

export function withCampaignSaveTimeout(promise, ms = CAMPAIGN_SAVE_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(CAMPAIGN_SAVE_TIMEOUT_MESSAGE);
      err.code = CAMPAIGN_SAVE_TIMEOUT_CODE;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function isCampaignSaveTimeout(err) {
  return err?.code === CAMPAIGN_SAVE_TIMEOUT_CODE;
}
