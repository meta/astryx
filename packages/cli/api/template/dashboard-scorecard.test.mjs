// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Responsive contract test for the dashboard-scorecard page template
 * @input Reads the shipped single-file template
 * @output Guards that the trend grid fits a phone-width container
 * @position CLI template regression coverage; runs in the node test project
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(
    dirname,
    '../../assets/templates/pages/dashboard-scorecard/page.tsx',
  ),
  'utf8',
);

describe('dashboard scorecard template contract', () => {
  it('caps the trend grid so a lone trend shrinks on a phone', () => {
    // Uncapped, `minWidth` is a hard track floor: a 330px track overflows
    // the 327px content box of a 375px phone. A positive `max` lets the lone
    // track shrink to its container. Four is one column per trend, so wide
    // layouts keep the count they had.
    const trends = [
      ...source.matchAll(/<Grid[^>]*columns=\{\{([^}]*)\}\}/g),
    ].find(match => /minWidth:\s*330\b/.test(match[1]));
    expect(trends?.[1]).toMatch(/\bmax:\s*4\b/);
  });
});
