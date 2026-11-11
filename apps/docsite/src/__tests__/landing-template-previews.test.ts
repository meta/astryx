// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import manifest from '../../public/landing/template-previews/manifest.json';
import {LANDING_TEMPLATE_ROWS} from '../app/(site)/_landing/landingTemplatePreviews';

const docsiteDir = path.resolve(__dirname, '../..');
const previewDir = path.join(docsiteDir, 'public/landing/template-previews');
const templatesDir = path.resolve(
  docsiteDir,
  '../../packages/cli/assets/templates/pages',
);
const RECAPTURE =
  'Start the docsite and run `pnpm -F @astryxdesign/docsite capture:landing-previews`.';

const previews: Record<
  string,
  {source: string; light: string; dark: string} | undefined
> = manifest.previews;
const slugs = LANDING_TEMPLATE_ROWS.flat();

describe('landing template previews', () => {
  it.each(slugs)('has current light and dark images for %s', slug => {
    const entry = previews[slug];
    expect(entry, `No preview for ${slug}. ${RECAPTURE}`).toBeDefined();
    const source = fs.readFileSync(path.join(templatesDir, slug, 'page.tsx'));
    const sourceHash = createHash('sha256').update(source).digest('hex');
    expect(
      entry?.source,
      `The ${slug} template changed after its preview was captured. ${RECAPTURE}`,
    ).toBe(sourceHash);
    for (const file of [entry?.light, entry?.dark]) {
      expect(fs.existsSync(path.join(previewDir, String(file)))).toBe(true);
    }
  });

  it('keeps no images that the manifest does not name', () => {
    const named = new Set(
      Object.values(previews).flatMap(entry =>
        entry ? [entry.light, entry.dark] : [],
      ),
    );
    const extra = fs
      .readdirSync(previewDir)
      .filter(file => file.endsWith('.webp') && !named.has(file));
    expect(extra).toEqual([]);
  });
});
