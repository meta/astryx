// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract for every path in the original Next static export.
 * @input Checked Next HTML manifest, authored pages, and generated template
 *   registry/wrappers (materialized by the Node project's global setup).
 * @output Fails if a deep link, typed template route, layout group, or
 *   trailing slash disappears.
 * @position Collected by the repository's node Vitest project.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {categories} from './app/sandboxPages';
import {blocks} from './generated/blockRegistry';
import {templates} from './generated/templateRegistry';
import {canHydrate} from './hydration-policy';
import {
  discoverRoutes,
  exportedHtmlPath,
  templateAssetBase,
} from '../scripts/route-manifest.mjs';
import oracle from '../scripts/next-export-routes.json';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'app');
const routes = discoverRoutes(
  app,
  categories.map(category => category.slug),
);

// The former Next export also emitted a synthetic /404/ page. The Vite exporter
// emits it separately from the application routes, alongside 404.html.
describe('Sandbox static export contract', () => {
  it('materializes every authored template as a physical Vite route before tests', () => {
    const generated = [...templates, ...blocks];
    expect(generated.length).toBeGreaterThan(0);
    const templateRoutes = routes.filter(item =>
      item.route.startsWith('/templates/'),
    );
    // Besides /templates/ itself, every generated route comes from an authored
    // page/block descriptor rather than a stale checked-in list or SPA fallback.
    expect(templateRoutes.length).toBe(generated.length + 1);
    expect(new Set(generated.map(item => item.slug)).size).toBe(
      generated.length,
    );
    for (const item of generated) {
      const wrapper = path.join(
        app,
        '(fullscreen)',
        'templates',
        item.slug,
        'page.tsx',
      );
      expect(fs.statSync(wrapper).isFile()).toBe(true);
      expect(
        templateRoutes.find(route => route.route === item.href)?.file,
      ).toBe(wrapper);
    }
  });

  it('matches every Next HTML route rather than just representative samples', () => {
    expect([...routes.map(item => item.route), '/404/'].sort()).toEqual(
      oracle.routes,
    );
    expect(routes.length).toBe(oracle.routes.length - 1);
  });

  it('preserves nested, fullscreen, raw, category, and audit layouts', () => {
    expect(routes.find(item => item.route === '/')).toMatchObject({
      group: 'sandbox',
    });
    expect(
      routes.find(item => item.route === '/pages/motion-lab/bugs/'),
    ).toMatchObject({group: 'sandbox'});
    expect(
      routes.find(item => item.route === '/pages/component-scores/'),
    ).toMatchObject({group: 'sandbox'});
    expect(
      routes.find(item => item.route === '/pages/mobile-prototypes/'),
    ).toMatchObject({group: 'raw'});
    expect(
      routes.find(item => item.route === '/templates/work-item-detail/'),
    ).toMatchObject({group: 'fullscreen'});
    expect(
      routes.find(item => item.route === '/components-patterns/'),
    ).toMatchObject({slug: 'components-patterns'});
    expect(exportedHtmlPath('/templates/TopNavHeadingShowcase/')).toBe(
      'templates/TopNavHeadingShowcase/index.html',
    );
    expect(exportedHtmlPath('/')).toBe('index.html');
  });

  it('prefixes template images exactly once for /sandbox/ while leaving local paths portable', () => {
    expect(templateAssetBase('')).toBe('');
    expect(templateAssetBase('/sandbox')).toBe('/sandbox/template-assets');
    expect(
      templateAssetBase('/sandbox', '/preview/sandbox/template-assets'),
    ).toBe('/preview/sandbox/template-assets');
  });

  it('avoids mismatched hydration for query-dependent Shell Lab and embed URLs', () => {
    expect(canHydrate('/pages/shell-lab/', '?variant=wash')).toBe(false);
    expect(canHydrate('/templates/login-sso/', '?embed=1&theme=stone')).toBe(
      false,
    );
    expect(canHydrate('/pages/component-scores/', '?filter=all')).toBe(true);
    expect(canHydrate('/pages/shell-lab/', '')).toBe(true);
    expect(canHydrate('/pages/perf-scenes/', '?scene=table')).toBe(false);
    expect(canHydrate('/pages/perf-scenes/', '')).toBe(true);
  });

  it('does not turn unknown URLs, dynamic segments or traversal into a 200 fallback', () => {
    expect(routes.some(item => item.route === '/pages/does-not-exist/')).toBe(
      false,
    );
    expect(() => exportedHtmlPath('/../outside/')).toThrow();
    expect(() => exportedHtmlPath('/pages/no-slash')).toThrow();
  });
});
