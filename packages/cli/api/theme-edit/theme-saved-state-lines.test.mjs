// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A saved state in a spelling the editor reads (toggle-button's
 * `aria-pressed`) is the part's own state in every line made from the
 * theme (`--state isPressed`), while the build still matches the file as
 * saved, so compile takes the theme after show.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
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

const file = () => path.join(cwd, 'themes/t/t.settings.json');

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-saved-state-lines-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a state saved as aria-pressed on toggle-button', () => {
  it(
    "show's lines name isPressed, and compile takes the theme after it",
    async () => {
      const d = JSON.parse(fs.readFileSync(file(), 'utf8'));
      d.settings = [
        {
          thing: 'background-color',
          value: '#000080',
          source: 'property',
          on: 'toggle-button',
          state: 'aria-pressed',
        },
      ];
      fs.writeFileSync(file(), JSON.stringify(d, null, 2));
      const shown = await runCli(
        ['experimental', 'theme', 'editor', 'show', 't'],
        cwd,
      );
      const lines = shown.stdout
        .split('\n')
        .filter(l => / editor (set|undo) t /.test(l));
      expect(lines.length).toBeGreaterThan(0);
      for (const l of lines.filter(x => x.includes('toggle-button')))
        expect(l).toContain('--state isPressed');
      expect(shown.stdout).not.toContain('--state aria-pressed');
      const compiled = await runCli(
        ['experimental', 'theme', 'compile', 'themes/t/t.theme.ts'],
        cwd,
      );
      expect(compiled.status).toBe(0);
    },
    T,
  );
});
