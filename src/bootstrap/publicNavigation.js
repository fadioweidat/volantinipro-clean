import { startTransition } from 'react';
import { SEO_ROUTES } from '../lib/seo/routePolicy.js';

const marketingPages = new Set(SEO_ROUTES.map(([, page]) => page));

// Keep the committed public page (including its navbar and SEO) while the
// destination's lazy chunk suspends. Private and configurator updates stay urgent.
export function commitPublicNavigation(currentPage, nextPage, setPage) {
  if (marketingPages.has(currentPage) && marketingPages.has(nextPage)) {
    startTransition(() => setPage(nextPage));
  } else {
    setPage(nextPage);
  }
}
