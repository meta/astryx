// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Prerender every exported Sandbox route into its physical HTML file.
 * @input Vite client build, generated route modules, checked Next path contract.
 * @output Visible route-specific content before JS, hydratable by src/main.tsx.
 * @position Build-time static generation; no server runs in deployment.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// The SSR transform must use the production StyleX class names used by the
// already built browser bundle. Set this before loading the Vite config.
process.env.NODE_ENV = 'production';
const {createServer} = await import('vite');
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(appDir, 'out');
const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const marker = '<div id="root"></div>';
if (!index.includes(marker))
  throw new Error('Vite index is missing the hydration root');
const {routes} = JSON.parse(
  fs.readFileSync(path.join(appDir, 'scripts/next-export-routes.json'), 'utf8'),
);
const sample = process.argv.find(arg => arg.startsWith('--sample='))?.slice(9);
const basePath = (process.env.SANDBOX_BASE_PATH || '').replace(/\/$/, '');
const server = await createServer({
  configFile: path.join(appDir, 'vite.config.mts'),
  root: appDir,
  mode: 'production',
  appType: 'custom',
  server: {middlewareMode: true, hmr: false},
  logLevel: 'error',
});
try {
  const {render, needsEmbed} = await server.ssrLoadModule(
    '/src/entry-server.tsx',
  );
  let embeddedCount = 0;
  const selected = sample
    ? [sample]
    : routes.filter(route => route !== '/404/');
  for (const route of selected) {
    if (!routes.includes(route) || route === '/404/') {
      throw new Error(`Unknown prerender sample ${route}`);
    }
    const content = await render(route, basePath);
    const embedded = needsEmbed(route)
      ? await render(route, basePath, true)
      : null;
    if (
      !content ||
      content.length < 100 ||
      (embedded != null && embedded.length < 100)
    ) {
      throw new Error(`Empty prerendered route ${route}`);
    }
    if (sample) {
      console.log(
        `${route}: ${content.length} HTML bytes; embed ${embedded?.length ?? 0} bytes; ${embedded?.slice(0, 180) ?? content.slice(0, 180)}`,
      );
      continue;
    }
    const file = path.join(out, route.slice(1), 'index.html');
    fs.writeFileSync(
      file,
      index.replace(
        marker,
        `<div id="root" data-route="${route}">${content}</div>`,
      ),
    );
    if (embedded != null) {
      embeddedCount++;
      fs.writeFileSync(
        path.join(out, route.slice(1), 'embed.html'),
        index.replace(
          marker,
          `<div id="root" data-route="${route}embed.html">${embedded}</div>`,
        ),
      );
    }
  }
  if (!sample) {
    console.log(
      `Prerendered ${selected.length} pages and ${embeddedCount} embed documents`,
    );
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  const closed = await Promise.race([
    server.close().then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 10_000)),
  ]);
  if (!closed) console.warn('Vite SSR server did not close in 10s');
  // Vite's background optimizer/watch handles can outlive close() on this
  // large source graph; all pages have already been written or an error set.
  process.exit(process.exitCode || 0);
}
