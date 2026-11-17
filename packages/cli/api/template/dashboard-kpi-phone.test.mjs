// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Phone contract test for dashboard KPI tile rows
 * @input Reads the shipped single-file dashboard templates
 * @output Guards that KPI tiles sit two to a row on a phone
 * @position CLI template regression coverage; runs in the node test project
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const read = name =>
  fs.readFileSync(
    path.resolve(dirname, `../../assets/templates/pages/${name}/page.tsx`),
    'utf8',
  );

describe('dashboard KPI tiles on a phone', () => {
  it('dashboard-scorecard keeps two columns below its large tier', () => {
    const source = read('dashboard-scorecard');
    expect(source).toMatch(/default: 'repeat\(2, minmax\(0, 1fr\)\)'/);
  });

  for (const name of ['dashboard-cohort-funnel', 'dashboard-alert-rail']) {
    it(`${name} folds its KPI row to two columns on a phone`, () => {
      const source = read(name);
      expect(source).toMatch(/\[KPI_PHONE\]: 'repeat\(2, minmax\(0, 1fr\)\)'/);
      // Above a phone the row keeps the auto-fit 240px floor it had.
      expect(source).toMatch(
        /default: 'repeat\(auto-fit, minmax\(240px, 1fr\)\)'/,
      );
      expect(source).toContain('xstyle={kpiGridStyles.grid}');
    });
  }

  for (const name of [
    'dashboard-scorecard',
    'dashboard-cohort-funnel',
    'dashboard-alert-rail',
  ]) {
    it(`${name} lets a tile's change wrap under its value`, () => {
      // A half-width tile is too narrow for the value and its change on one
      // line; without wrap the change runs past the tile.
      expect(read(name)).toMatch(/<HStack[^>]*wrap="wrap">\s*<Heading/);
    });
  }
});
