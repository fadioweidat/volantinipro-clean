import test from 'node:test';
import assert from 'node:assert/strict';
import React, { Suspense } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { preloadablePage } from '../src/bootstrap/preloadablePage.jsx';

test('preloaded public page renders real content synchronously without the Suspense loader', async () => {
  let calls = 0;
  let finish;
  const modulePromise = new Promise(resolve => { finish = resolve; });
  const Page = preloadablePage(() => { calls++; return modulePromise; });
  const first = Page.preload();
  assert.equal(Page.preload(), first);
  finish({ default: ({ title }) => React.createElement('h1', null, title) });
  await first;
  const html = renderToStaticMarkup(React.createElement(Suspense,
    { fallback: React.createElement('p', null, 'LOADER') }, React.createElement(Page, { title: 'Public page' })));
  assert.equal(html, '<h1>Public page</h1>');
  assert.equal(calls, 1);
});

test('ordinary app navigation still loads a public page lazily', async () => {
  let calls = 0;
  const Page = preloadablePage(async () => { calls++; return { default: () => React.createElement('h1', null, 'Ready') }; });
  assert.equal(calls, 0);
  renderToStaticMarkup(React.createElement(Suspense, { fallback: 'LOADER' }, React.createElement(Page)));
  assert.equal(calls, 1);
  await Page.preload();
  assert.equal(renderToStaticMarkup(React.createElement(Page)), '<h1>Ready</h1>');
});

test('preload failure rejects so bootstrap can retain the snapshot and offer retry', async () => {
  const failure = new Error('Chunk unavailable');
  const Page = preloadablePage(() => Promise.reject(failure));
  await assert.rejects(Page.preload(), error => error === failure);
});
