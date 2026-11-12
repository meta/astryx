// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The build-time preview snapshots rewrite template sources the way the
 * Next build does, including with the experimental DOCSITE_ICON_SET setting.
 *
 * @input scripts/lib/preview-source-transform.mjs
 * @output Regression coverage for the snapshot source rewrites
 * @position Build-time docsite tooling verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {transformPreviewSource} from '../../scripts/lib/preview-source-transform.mjs';

const DOCSITE = path.resolve(__dirname, '../..');
const PAGE = path.resolve(
  DOCSITE,
  '../../packages/cli/assets/templates/pages/product-detail/page.tsx',
);
const SOURCE = "const a = '/template-assets/light-product-1.png';";

describe('transformPreviewSource', () => {
  it('addresses a page template image by its optimizer URL', async () => {
    const out = await transformPreviewSource(SOURCE, PAGE, {
      publicDir: path.join(DOCSITE, 'public'),
      projectDir: DOCSITE,
      iconSet: '',
    });
    expect(out).toContain(
      '/_next/image?url=%2Ftemplate-assets%2Flight-product-1.png',
    );
  });

  it('gives the icon rewrite the set list when DOCSITE_ICON_SET names sets', async () => {
    const calls: unknown[] = [];
    await transformPreviewSource(SOURCE, PAGE, {
      publicDir: path.join(DOCSITE, 'public'),
      projectDir: DOCSITE,
      iconSet: 'lucide, heroicons',
      rewriteIcons: async (source, _file, options) => {
        calls.push(options);
        return source;
      },
    });
    expect(calls).toEqual([
      {projectDir: DOCSITE, list: ['lucide', 'heroicons']},
    ]);
  });

  it('runs the real icon rewrite with the setting on instead of throwing', async () => {
    const out = await transformPreviewSource(SOURCE, PAGE, {
      publicDir: path.join(DOCSITE, 'public'),
      projectDir: DOCSITE,
      iconSet: 'lucide',
      discover: async () => [],
    });
    expect(out).toContain('/_next/image?url=');
  });

  it('leaves a source outside the templates unchanged', async () => {
    const file = path.join(DOCSITE, 'src/components/Example.tsx');
    const out = await transformPreviewSource(SOURCE, file, {
      publicDir: path.join(DOCSITE, 'public'),
      projectDir: DOCSITE,
      iconSet: 'lucide',
      rewriteIcons: async () => 'rewritten',
    });
    expect(out).toBe(SOURCE);
  });
});
