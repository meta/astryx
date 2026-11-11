// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract for the Chromium selection's replay record
 *   (`.github/interaction-selection-replay.json`): one row a pull request,
 *   public data only, and no escape left without a reviewed note.
 * @position Node contract for spec:AST-030 FR31's replay evidence.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const record = JSON.parse(
  fs.readFileSync(
    path.join(root, '.github/interaction-selection-replay.json'),
    'utf8',
  ),
);
const SPEC = /^packages\/[^/]+\/src\/[^\s]+\.spec\.ts$/;

describe('the Chromium selection replay record', () => {
  it('has one row a pull request', () => {
    const numbers = record.rows.map(row => row.pr);
    expect(numbers.length).toBeGreaterThanOrEqual(150);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('holds only public data: pull request numbers, commits and spec paths', () => {
    // No link of any kind: a row names pull requests, commits and specs only.
    expect(JSON.stringify(record)).not.toMatch(/https?:\/\//i);
    for (const row of record.rows) {
      expect(
        Object.keys(row).filter(
          key =>
            ![
              'pr',
              'commit',
              'kind',
              'selection',
              'full_reason',
              'full_run_failures',
              'verdict',
            ].includes(key),
        ),
        String(row.pr),
      ).toEqual([]);
      expect(Number.isInteger(row.pr)).toBe(true);
      expect(row.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(['merge', 'head']).toContain(row.kind);
      if (Array.isArray(row.selection))
        for (const spec of row.selection) expect(spec).toMatch(SPEC);
      else expect(['full', 'out of scope']).toContain(row.selection);
      for (const spec of row.full_run_failures) expect(spec).toMatch(SPEC);
    }
  });

  it('leaves no failing spec outside a selection without a reviewed note', () => {
    for (const row of record.rows) {
      expect(row.verdict, String(row.pr)).not.toMatch(
        /^(escape|failures unknown)/,
      );
      if (!Array.isArray(row.selection)) continue;
      for (const spec of row.full_run_failures)
        if (!row.selection.includes(spec))
          expect(record.reviewed[spec], `#${row.pr} ${spec}`).toBeTruthy();
    }
  });
});
