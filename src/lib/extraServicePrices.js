// Prezzi dei servizi di controllo a pagamento: unica fonte per il registro
// extra e per i testi del sito, cosi' prezzo e copy non divergono.
export const TRACKING_GPS_PRICE = 60;
export const PHOTO_PROOF_PRICE = 30;
export const PHOTO_REPORT_PRICE = 50;

export const TRACKING_GPS_EXTRA = `Tracking GPS (+€${TRACKING_GPS_PRICE})`;
export const PHOTO_REPORT_EXTRA = `Report fotografico (+€${PHOTO_REPORT_PRICE})`;
export const PAID_PROOFS_NOTE = `${TRACKING_GPS_EXTRA} e ${PHOTO_REPORT_EXTRA} sono servizi aggiuntivi a pagamento.`;
