// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Responsive contract test for the side-gallery page template
 * @input Reads the shipped single-file template
 * @output Guards that the copy/gallery split fits a phone-width container
 * @position CLI template regression coverage; runs in the node test project
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(dirname, '../../assets/templates/pages/side-gallery/page.tsx'),
  'utf8',
);

/** Object-form `columns` of every Grid in the template, as source text. */
function objectColumns() {
  return [...source.matchAll(/<Grid[^>]*columns=\{\{([^}]*)\}\}/g)].map(
    match => match[1],
  );
}

describe('side gallery template contract', () => {
  it('caps the copy/gallery split so a lone column shrinks on a phone', () => {
    // Uncapped, `minWidth` is a hard track floor: a 360px track overflows
    // the 327px content box of a 375px phone. A positive `max` lets the lone
    // track shrink to its container.
    const split = objectColumns().find(cols => /minWidth:\s*360\b/.test(cols));
    expect(split).toBeDefined();
    expect(split).toMatch(/\bmax:\s*2\b/);
  });
});
