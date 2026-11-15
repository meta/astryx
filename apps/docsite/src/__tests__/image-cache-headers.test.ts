// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Homepage and template preview photos get a cache lifetime, so a
 * returning visitor does not download or revalidate them on every visit.
 *
 * @input next.config.mjs headers()
 * @output Regression coverage for the photo Cache-Control rules
 * @position Build-time docsite configuration verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {describe, expect, it} from 'vitest';

type HeaderRule = {
  source: string;
  headers: Array<{key: string; value: string}>;
};

async function headerRules(): Promise<HeaderRule[]> {
  const {default: nextConfig} = await import('../../next.config.mjs');
  return (
    nextConfig as unknown as {headers: () => Promise<HeaderRule[]>}
  ).headers();
}

describe('photo cache headers', () => {
  it.each(['/landing/:path*', '/template-assets/:path*'])(
    '%s is cached for a day and refreshed in the background',
    async source => {
      const rule = (await headerRules()).find(each => each.source === source);
      const cacheControl = rule?.headers.find(
        header => header.key === 'Cache-Control',
      )?.value;
      expect(cacheControl).toBe(
        'public, max-age=86400, stale-while-revalidate=2592000',
      );
    },
  );

  it('does not mark the photos immutable, because their URLs do not change with their content', async () => {
    const values = (await headerRules()).flatMap(rule =>
      rule.headers.map(header => header.value),
    );
    expect(values.some(value => value.includes('immutable'))).toBe(false);
  });
});
