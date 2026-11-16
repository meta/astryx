// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a whole-theme change leaves out comes right under the status
 * line, each part with its own runnable line; a border width reaches every
 * part that draws a fixed line of its own or frames a surface (a secondary
 * button, a banner), and only real rules count as dividers.
 */

import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The assertions are about settings, builds, notes and lines, not rendered
// pages: a render costs seconds, so the pages are written by the stand-in.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt173-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('a border width set for the whole theme', () => {
  it('gives one runnable line per part it does not reach, the framed and fixed-line parts included', async () => {
    await themeEditNew('w1', {cwd});
    const r = await themeEditSet('w1', '--border-width', '4px', {cwd});
    const [surfaces, dividers] = r.data.leftOut;
    for (const part of ['popover', 'tooltip', 'banner', 'dialog'])
      expect(surfaces.run, part).toContainEqual(
        expect.stringMatching(
          new RegExp(
            ` set w1 border '4px solid var\\(--color-border\\)' --on ${part}$`,
          ),
        ),
      );
    // A part whose variants differ is framed in the variants that draw a
    // box (the button's ghost keeps none), as show's missed list frames it.
    expect(surfaces.run).toContainEqual(
      expect.stringMatching(/ --on button --when variant:primary$/),
    );
    expect(surfaces.run).not.toContainEqual(
      expect.stringMatching(/ --on button$/),
    );
    expect(surfaces.run.length).toBeGreaterThan(5);
    const named = dividers.run.map((/** @type {string} */ l) =>
      l.replace(/.* --on /, ''),
    );
    expect(named).toContain('table-cell');
    for (const part of ['button', 'item', 'list-item'])
      expect(named, part).not.toContain(part);
  }, 240_000);

  it('prints what it leaves out right under the status line', async () => {
    await themeEditNew('w2', {cwd});
    const out = spawnSync(
      process.execPath,
      [
        BIN,
        'experimental',
        'theme',
        'editor',
        'set',
        'w2',
        '--border-width',
        '3px',
      ],
      {cwd, encoding: 'utf8'},
    ).stdout;
    const lines = out.split('\n').filter(Boolean);
    expect(lines[0]).toMatch(/^\[ok\] w2: --border-width = 3px/);
    expect(lines[1]).toMatch(/^- --border-width does not reach the surfaces/);
    expect(lines[2]).toMatch(
      / set w2 border '3px solid var\(--color-border\)' --on /,
    );
  }, 240_000);
});
