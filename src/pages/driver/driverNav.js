// Navigazione SPA Programma <-> Mappa senza reload completo. Il router
// esistente (src/main.jsx, Root()) sceglie il componente da montare in base
// a window.location.pathname letto una sola volta al mount iniziale — prima
// di questo fix, l'unico modo di cambiare pathname era una vera navigazione
// browser (window.location.href/<a href>), che scarica di nuovo l'intero
// bundle. navigateDriver aggiorna la history (pushState, cosi' il tasto
// Indietro del browser funziona) e notifica Root tramite lo stesso evento
// nativo 'popstate' che il browser gia' emette per la navigazione reale
// (Root.jsx vi si e' messo in ascolto) — nessun secondo router introdotto,
// solo il meccanismo di history del browser gia' usato dal primo.
export function navigateDriver(path) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Path di destinazione con la query string corrente (?access=TOKEN)
// preservata — senza questo il link Driver pubblico perderebbe
// l'autorizzazione passando da Programma a Mappa o viceversa.
export function driverPathWithQuery(path) {
  return `${path}${window.location.search}`;
}

// Click handler per il link "← Programma": resta un vero <a href> (tasto
// destro "apri in nuova scheda", middle-click, Ctrl/Cmd+click funzionano
// come previsto), ma un click normale naviga via SPA invece di ricaricare.
export function driverBackClick(event, href) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigateDriver(href);
}
