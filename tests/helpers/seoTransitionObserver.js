// Serialized with evaluateOnNewDocument/addInitScript: runs before application JS.
export function installSeoTransitionObserver() {
  const proof = window.__seoTransition = {
    installed: performance.now(), scriptsAtInstall: document.scripts.length,
    firstContent: null, bootstrapBoundary: null, samples: [], errors: [], frames: 0,
  };
  let originalH1, signature;
  const visible = element => {
    if (!element?.isConnected || !element.getBoundingClientRect().height) return false;
    for (let node = element; node?.nodeType === 1; node = node.parentElement) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) return false;
    }
    return true;
  };
  function sample(source) {
    const root = document.getElementById('root');
    const h1 = [...document.querySelectorAll('h1')], nav = [...document.querySelectorAll('nav')];
    const visibleH1 = h1.filter(visible), visibleNav = nav.filter(visible);
    const text = root?.innerText || '';
    const keys = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(node => node.getAttribute('data-seo-jsonld') || node.id || node.textContent);
    const state = { ms: performance.now(), source, path: location.pathname,
      h1: h1.length, visibleH1: visibleH1.length, nav: nav.length, visibleNav: visibleNav.length,
      meaningful: visibleH1.length === 1 && text.length > 200,
      loader: visibleH1.length === 0 && /Caricamento in corso|Loading/i.test(text),
      duplicateJsonLd: keys.length - new Set(keys).size,
      title: document.title, canonical: document.querySelector('link[rel="canonical"]')?.href,
      h1Text: visibleH1[0]?.textContent?.trim() || '', visibleText: text.slice(0, 250) };
    if (proof.firstContent === null && state.meaningful && state.visibleNav === 1) {
      proof.firstContent = state.ms; originalH1 = visibleH1[0];
    }
    if (originalH1 && !originalH1.isConnected && proof.bootstrapBoundary === null) proof.bootstrapBoundary = state.ms;
    if (source === 'frame') proof.frames++;
    const next = JSON.stringify({ ...state, ms: 0, source: '' });
    if (next !== signature) { proof.samples.push(state); signature = next; }
    proof.last = state;
  }
  new MutationObserver(() => sample('mutation')).observe(document,
    { subtree: true, childList: true, attributes: true, characterData: true });
  function frame() { sample('frame'); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  setInterval(() => sample('timer'), 10);
  addEventListener('error', event => { if (event.message) proof.errors.push(event.message); });
  addEventListener('unhandledrejection', event => proof.errors.push(String(event.reason)));
  sample('installed');
}

export function transitionFailures(proof, after = proof.firstContent) {
  return proof.samples.filter(sample => sample.ms >= after &&
    (!sample.meaningful || sample.visibleH1 !== 1 || sample.nav !== 1 ||
      sample.visibleNav !== 1 || sample.loader || sample.duplicateJsonLd));
}
