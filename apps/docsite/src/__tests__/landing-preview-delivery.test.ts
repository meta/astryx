// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The landing preview markup reaches the page once: as server HTML.
 * The browser bundle gets an empty preview map instead of the markup, so the
 * markup is not sent again in the JavaScript or the page's RSC payload.
 *
 * @input next.config.mjs, the browser stand-in for the preview map, and the
 *   generate step's outputs
 * @output Regression coverage for where the landing preview markup goes
 * @position Build-time docsite configuration verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {LANDING_PREVIEWS as BROWSER_PREVIEWS} from '../app/(site)/_landing/landingPreviewsInBrowser';
import {
  CLIENT_NAVIGATION_FILE,
  CLIENT_NAVIGATION_URL,
} from '../../scripts/generate-landing-template-previews.mjs';

const DOCSITE = path.resolve(__dirname, '../..');
const PREVIEW_MAP = path.join(DOCSITE, 'src/generated/landingPreviews.ts');

type Replacement = {
  resourceRegExp: RegExp;
  newResource: (data: {
    request?: string;
    createData?: {resource: string};
  }) => void;
};

class FakeReplacementPlugin {
  resourceRegExp: RegExp;
  newResource: Replacement['newResource'];
  constructor(re: RegExp, fn: Replacement['newResource']) {
    this.resourceRegExp = re;
    this.newResource = fn;
  }
}

async function pluginsFor(isServer: boolean) {
  const {default: nextConfig} = await import('../../next.config.mjs');
  const config = {
    module: {rules: []},
    resolve: {alias: {}, modules: []},
    plugins: [] as unknown[],
  };
  (
    nextConfig as unknown as {
      webpack: (config: unknown, options: unknown) => unknown;
    }
  ).webpack(config, {
    isServer,
    webpack: {
      BannerPlugin: class {},
      NormalModuleReplacementPlugin: FakeReplacementPlugin,
    },
  });
  return config.plugins.filter(
    (plugin): plugin is FakeReplacementPlugin =>
      plugin instanceof FakeReplacementPlugin,
  );
}

describe('landing preview map in the bundles', () => {
  it('replaces the preview map with the empty stand-in in the browser bundle', async () => {
    const [plugin] = await pluginsFor(false);
    expect(plugin?.resourceRegExp.test(PREVIEW_MAP)).toBe(true);
    const resolved = {createData: {resource: PREVIEW_MAP}};
    plugin.newResource(resolved);
    expect(resolved.createData.resource).toBe(
      path.join(DOCSITE, 'src/app/(site)/_landing/landingPreviewsInBrowser.ts'),
    );
  });

  it('keeps the markup for the server render', async () => {
    expect(await pluginsFor(true)).toEqual([]);
  });

  it('gives the browser an empty map', () => {
    expect(BROWSER_PREVIEWS).toEqual({});
  });
});

type HeaderRule = {
  source: string;
  headers: Array<{key: string; value: string}>;
};

/** A header rule's `source` as a regular expression (named segments only). */
function sourcePattern(source: string): RegExp {
  const escaped = source
    .split(/(\/:\w+[*+]?)/u)
    .map(part => {
      const param = /^\/:\w+([*+]?)$/u.exec(part);
      if (param == null) {
        return part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      }
      if (param[1] === '*') {
        return '(?:/.*)?';
      }
      return param[1] === '+' ? '/.+' : '/[^/]+';
    })
    .join('');
  return new RegExp(`^${escaped}$`, 'u');
}

describe('client-side navigation file', () => {
  it('is a static file the docsite serves from its public folder', () => {
    expect(CLIENT_NAVIGATION_FILE).toBe(
      path.join(DOCSITE, 'public', CLIENT_NAVIGATION_URL),
    );
    expect(CLIENT_NAVIGATION_URL).toMatch(/^\/[\w/-]+\.json$/u);
  });

  it('gets no long-cache header, because every deploy rewrites it', async () => {
    const {default: nextConfig} = await import('../../next.config.mjs');
    const rules = await (
      nextConfig as unknown as {headers: () => Promise<HeaderRule[]>}
    ).headers();
    const caching = rules.filter(
      rule =>
        sourcePattern(rule.source).test(CLIENT_NAVIGATION_URL) &&
        rule.headers.some(
          header =>
            header.key.toLowerCase() === 'cache-control' &&
            /max-age=[1-9]|stale-while-revalidate|immutable/u.test(
              header.value,
            ),
        ),
    );
    expect(caching.map(rule => rule.source)).toEqual([]);
    // The matcher reads the photo rule as covering what it covers.
    expect(sourcePattern('/landing/:path*').test('/landing/a/b.json')).toBe(
      true,
    );
  });
});
