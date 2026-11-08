// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressPaintSource.test.ts
 * @input The core source tree
 * @output Fails when the touch press's paint formula is written anywhere but
 *   interactionOverlay.stylex.ts
 * @position Guards the one-source rule for the press paint: a copied
 *   `color-mix` across files is where a component quietly stops responding to
 *   the theme while the rest keep working. Components paint
 *   `var(--_press-paint)` / `var(--_press-paint-image)` instead.
 */

import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = join(__dirname, '..');
const ONE_SOURCE = 'utils/interactionOverlay.stylex.ts';
/**
 * The formula's shape: the pressed token mixed at a computed strength, as
 * StyleX source (`${colorVars['--color-overlay-pressed']}`) or as plain CSS.
 */
const FORMULA =
  /color-mix\(in srgb,\s*(?:\$\{colorVars\['--color-overlay-pressed'\]\}|var\(--color-overlay-pressed\))\s*calc\(/;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      yield* sourceFiles(path);
    } else if (
      /\.(ts|tsx|mjs)$/.test(entry) &&
      !/\.test\.(ts|tsx|mjs)$/.test(entry)
    ) {
      yield path;
    }
  }
}

describe('the touch press paint has one source', () => {
  it('writes the pressed-token-at-strength formula in interactionOverlay.stylex.ts and nowhere else', () => {
    const offenders: string[] = [];
    let declaredInSource = 0;
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      const rel = relative(SRC, file).split('\\').join('/');
      // Doc comments describe the formula in words; only code counts.
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const hits = code.match(new RegExp(FORMULA.source, 'g')) ?? [];
      if (rel === ONE_SOURCE) {
        declaredInSource = hits.length;
      } else if (hits.length > 0) {
        offenders.push(`${rel} (${hits.length})`);
      }
    }
    expect(declaredInSource).toBe(1);
    expect(offenders).toEqual([]);
  });
});
