import React, { lazy } from 'react';

// Keep lazy loading on normal app navigation, but let a prerendered entry wait
// for its real component before createRoot replaces the useful static page.
export function preloadablePage(load) {
  let resolved;
  let pending;
  const preload = () => pending ||= load().then(module => {
    resolved = module.default;
    return module;
  });
  const LazyPage = lazy(preload);
  function Page(props) {
    return React.createElement(resolved || LazyPage, props);
  }
  Page.preload = preload;
  return Page;
}
