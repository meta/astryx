// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A font role the build gives one family and no fallback at all
 * (headings set to Lora alone, as Core builds a heading family with no
 * fallbacks of its own) is noted, with the way to a list from where the
 * family came: the setting, run again with a list, or the theme's own
 * source.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt194-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {any} r */
const lone = r =>
  (r.data.notes ?? []).filter((/** @type {string} */ n) =>
    n.includes('with no fallback while it loads or if it is missing'),
  );

describe('a font role with one family and no fallback', () => {
  it(
    'set as a token, is noted with a set line that gives it a list, and that line clears the note',
    async () => {
      const set = await themeEditSet('t', '--font-family-heading', 'Lora', {
        cwd,
      });
      const [note] = lone(set);
      expect(note).toMatch(
        /^headings use only Lora, with no fallback while it loads or if it is missing; to fall back, give a list: .* set t --font-family-heading 'Lora, system-ui, sans-serif'$/,
      );
      // The line offered, run as offered.
      const line = /experimental theme editor (set .*)$/.exec(note)?.[1] ?? '';
      const args = line
        .match(/'[^']*'|\S+/g)
        ?.map(w => w.replace(/^'|'$/g, ''));
      const r = await runCli(
        ['experimental', 'theme', 'editor', ...(args ?? [])],
        cwd,
      );
      expect(r.status).toBe(0);
      expect(
        fs.readFileSync(path.join(cwd, 'themes/t/t.css'), 'utf8'),
      ).toContain('--font-family-heading: Lora, system-ui, sans-serif');
      expect(lone(await themeEditShow('t', {cwd}))).toEqual([]);
      await runCli(
        [
          'experimental',
          'theme',
          'editor',
          'undo',
          't',
          '--font-family-heading',
        ],
        cwd,
      );
    },
    T,
  );

  it(
    "set in the theme source's typography, is noted with the source change",
    async () => {
      const source = path.join(cwd, 'themes/t/t.theme.ts');
      const was = fs.readFileSync(source, 'utf8');
      fs.writeFileSync(
        source,
        was.replace(
          "name: 't',",
          "name: 't',\n  typography: {heading: {family: 'Lora'}},",
        ),
      );
      try {
        const shown = await themeEditShow('t', {cwd});
        expect(lone(shown)).toEqual([
          "headings use only Lora, with no fallback while it loads or if it is missing; to fall back, give typography.heading its fallbacks in themes/t/t.theme.ts (such as fallbacks: 'system-ui, sans-serif')",
        ]);
        // A heading with fallbacks of its own: no note.
        fs.writeFileSync(
          source,
          was.replace(
            "name: 't',",
            "name: 't',\n  typography: {heading: {family: 'Lora', fallbacks: 'Georgia, serif'}},",
          ),
        );
        expect(lone(await themeEditShow('t', {cwd}))).toEqual([]);
      } finally {
        fs.writeFileSync(source, was);
        await themeEditShow('t', {cwd});
      }
    },
    T,
  );
});
