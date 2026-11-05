// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Browser entry for the generated Sandbox route tree.
 * @input Vite's route manifest, prerendered HTML, and browser URL.
 * @output Hydrated route-group layout plus lazy navigation to other pages.
 * @position Client entry; scripts/prerender.mjs emits HTML for every route.
 */

'use client';

import {lazy, useMemo, type ComponentType} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {BrowserRouter, useLocation} from 'react-router-dom';
import {findRoute, loadPage} from './route-entry';
import {RouteView} from './RouteView';
import {SandboxLink, basePath} from './router';
import {canHydrate} from './hydration-policy';
import './app/globals.css';

const loadedPages = new Map<string, ComponentType>();

function App() {
  const {pathname} = useLocation();
  const entry = findRoute(pathname);
  const Page = useMemo(() => {
    if (!entry) {
      return null;
    }
    const loaded = loadedPages.get(entry.route);
    if (loaded) {
      return loaded;
    }
    return lazy(async () => {
      const component = await loadPage(entry);
      loadedPages.set(entry.route, component);
      return {default: component};
    });
  }, [entry]);

  if (!entry || !Page) {
    return (
      <main>
        <h1>Page not found</h1>
        <SandboxLink href="/">Sandbox home</SandboxLink>
      </main>
    );
  }
  return <RouteView entry={entry} Page={Page} />;
}

async function start() {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Sandbox root element is missing');
  }
  const pathname = window.location.pathname.slice(basePath.length) || '/';
  const entry = findRoute(pathname);
  if (entry) {
    loadedPages.set(entry.route, await loadPage(entry));
  }
  const app = (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  );
  // Embeds change the theme and shell; Shell Lab reads query params in its
  // first render. Their static HTML reflects the default route, so client-
  // render query-dependent visits rather than hydrating mismatched markup.
  if (root.hasChildNodes() && canHydrate(entry?.route, location.search)) {
    hydrateRoot(root, app);
  } else {
    createRoot(root).render(app);
  }
}

void start();
