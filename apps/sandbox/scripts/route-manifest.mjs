// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Static route inventory shared by Vite's module graph and HTML exporter.
 * @input Authored page.tsx files, generated template wrappers, category slugs.
 * @output Exact trailing-slash route manifest; no SPA fallback or unknown routes.
 * @position Build-time counterpart of Sandbox's former Next static route tree.
 */

import fs from 'node:fs';
import path from 'node:path';

const GROUPS = new Set(['(sandbox)', '(fullscreen)', '(raw)']);

export function routeForPage(relativeFile) {
  const parts = relativeFile.split(/[\\/]/);
  if (!GROUPS.has(parts[0]) || parts.at(-1) !== 'page.tsx') {
    throw new Error(`Unexpected Sandbox page: ${relativeFile}`);
  }
  const segments = parts.slice(1, -1);
  if (
    segments.some(segment => segment.startsWith('[') || segment.startsWith('('))
  ) {
    throw new Error(`Unexpanded dynamic route: ${relativeFile}`);
  }
  return `/${segments.length ? `${segments.join('/')}/` : ''}`;
}

/** Scan only the app's page tree (including ignored, freshly generated wrappers). */
export function discoverRoutes(appDir, categories) {
  const routes = new Map();
  function add(route, file, group, slug) {
    if (routes.has(route)) {
      throw new Error(
        `Duplicate Sandbox route ${route}: ${file} and ${routes.get(route).file}`,
      );
    }
    routes.set(route, {route, file, group, ...(slug && {slug})});
  }
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      const next = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__generated__')
          continue;
        visit(path.join(directory, entry.name), next);
      } else if (entry.name === 'page.tsx') {
        if (next.includes('[category]')) continue;
        const group = next.split(path.sep)[0].slice(1, -1);
        add(routeForPage(next), path.join(appDir, next), group);
      }
    }
  }
  visit(appDir);
  for (const slug of categories) {
    if (slug === 'templates') continue;
    if (!/^[a-z0-9-]+$/.test(slug))
      throw new Error(`Invalid category slug: ${slug}`);
    add(
      `/${slug}/`,
      path.join(appDir, '(sandbox)/[category]/CategoryContent.tsx'),
      'sandbox',
      slug,
    );
  }
  if (!routes.has('/')) throw new Error('Sandbox home route is missing');
  return [...routes.values()].sort((a, b) =>
    a.route < b.route ? -1 : a.route > b.route ? 1 : 0,
  );
}

export function templateAssetBase(basePath, override = '') {
  return override || (basePath ? `${basePath}/template-assets` : '');
}

export function exportedHtmlPath(route) {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(route)) {
    throw new Error(`Invalid static export route: ${route}`);
  }
  return route === '/' ? 'index.html' : `${route.slice(1)}index.html`;
}
