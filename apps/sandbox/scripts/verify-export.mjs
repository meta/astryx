// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Post-build check against the complete original Next export.
 * @input Vite out/, checked Next path manifest, optional SANDBOX_BASE_PATH.
 * @output Nonzero exit if HTML routes, page bodies, links, metadata, assets or 404 diverge.
 * @position Sandbox build contract; runs after every production Vite build.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(appDir, 'out');
const oracle = JSON.parse(
  fs.readFileSync(path.join(appDir, 'scripts/next-export-routes.json'), 'utf8'),
);
const base = `${(process.env.SANDBOX_BASE_PATH || '').replace(/\/$/, '')}/`;
const htmlRoutes = [];
let embedDocuments = 0;
function visit(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name === 'index.html') {
      const rel = path.relative(out, path.dirname(file));
      htmlRoutes.push(rel ? `/${rel.split(path.sep).join('/')}/` : '/');
    }
  }
}
visit(out);
htmlRoutes.sort();
if (JSON.stringify(htmlRoutes) !== JSON.stringify(oracle.routes)) {
  const missing = oracle.routes.filter(route => !htmlRoutes.includes(route));
  const extra = htmlRoutes.filter(route => !oracle.routes.includes(route));
  throw new Error(
    `Static route mismatch: missing ${missing.join(', ')}, extra ${extra.join(', ')}`,
  );
}
for (const route of oracle.routes) {
  if (route === '/404/') continue;
  const html = fs.readFileSync(
    path.join(out, route.slice(1), 'index.html'),
    'utf8',
  );
  if (
    !html.includes('<title>Astryx Sandbox</title>') ||
    !html.includes('Astryx component testing sandbox')
  ) {
    throw new Error(`Missing public metadata at ${route}`);
  }
  // A copied Vite shell is not an export: every deep link must have its own
  // prerendered page and layout, even if JavaScript never runs.
  if (
    !html.includes(`<div id="root" data-route="${route}">`) ||
    html.length < 300
  ) {
    throw new Error(`Missing prerendered page body at ${route}`);
  }
  if (route === '/' && !html.includes('Astryx Sandbox</h1>')) {
    throw new Error('Home heading missing from static HTML');
  }
  if (
    route === '/pages/component-scores/' &&
    !html.includes('component-audit-details')
  ) {
    throw new Error('Component audit page missing from static HTML');
  }
  if (
    route === '/templates/login-sso/' &&
    !html.includes('embed.html?embed=1')
  ) {
    throw new Error('Login template lost its static iframe document');
  }
  if (html.includes('embed.html?embed=1')) {
    embedDocuments++;
    const embedPath = path.join(out, route.slice(1), 'embed.html');
    if (!fs.existsSync(embedPath)) {
      throw new Error(`Fullscreen preview has no static embed at ${route}`);
    }
    const embed = fs.readFileSync(embedPath, 'utf8');
    if (
      !embed.includes(`<div id="root" data-route="${route}embed.html">`) ||
      embed.length < 300 ||
      embed.includes(`<iframe src="${base}${route.slice(1)}embed.html?embed=1`)
    ) {
      throw new Error(`Fullscreen embed is empty or recursive at ${route}`);
    }
    if (route === '/templates/login-sso/' && !embed.includes('Welcome back')) {
      throw new Error('Login template lacks its page content in static HTML');
    }
  }
  for (const match of html.matchAll(
    /(?:src|href)="([^"#]+\.(?:js|css))(?:\?[^\"]*)?"/g,
  )) {
    const asset = match[1];
    if (!asset.startsWith(base))
      throw new Error(`Wrong asset base at ${route}: ${asset}`);
    if (!fs.existsSync(path.join(out, asset.slice(base.length))))
      throw new Error(`Missing asset at ${route}: ${asset}`);
  }
}
if (
  !fs.existsSync(path.join(out, '404.html')) ||
  !fs.existsSync(path.join(out, 'template-assets'))
) {
  throw new Error('404 or template assets missing');
}
console.log(
  `Verified ${htmlRoutes.length} HTML routes, ${embedDocuments} fullscreen embeds, and their JS/CSS links against the Next export (${base})`,
);
