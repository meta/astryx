// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A value the editor refuses in a theme two `extends` up, in a file a
 * parent's file imports, is named in that file and line, never blamed on
 * the theme file.
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
    await importOriginal(),
  ),
);

const T = 240_000;
const I = "import {defineTheme} from '@astryxdesign/core/theme';";

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt236-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} rel @param {string} text */
const write = (rel, text) =>
  fs.writeFileSync(path.join(cwd, 'themes/t', rel), text);

describe('a value two parents up', () => {
  it(
    'is named in the file and line that hold it, and the line offered shows it',
    async () => {
      const source = path.join(cwd, 'themes/t/t.theme.ts');
      const was = fs.readFileSync(source, 'utf8');
      write(
        'parent.ts',
        `${I}\nimport {tSettings} from './t.settings';\nexport const parent = defineTheme({extends: tSettings, name: 'parent', tokens: {'--color-accent': 7}});\n`,
      );
      write(
        'parent2.ts',
        `${I}\nimport {parent as p0} from './parent';\nexport const parent = defineTheme({extends: p0, name: 'parent2'});\n`,
      );
      fs.writeFileSync(
        source,
        `${I}\nimport {parent} from './parent2';\nexport const tTheme = defineTheme({extends: parent, name: 't'});\n`,
      );
      try {
        const r = await runCli(
          ['experimental', 'theme', 'compile', 'themes/t/t.theme.ts', '--json'],
          cwd,
        );
        const out = JSON.parse(r.stdout);
        expect(out.error).toContain(
          "theme 'parent' tokens --color-accent (in themes/t/parent.ts, line 3)",
        );
        expect(out.error).toContain('Change it in themes/t/parent.ts.');
        expect(out.suggestions.map((/** @type {any} */ s) => s.name)).toContain(
          'sed -n 3p themes/t/parent.ts',
        );
      } finally {
        fs.writeFileSync(source, was);
        for (const f of ['parent.ts', 'parent2.ts'])
          fs.rmSync(path.join(cwd, 'themes/t', f), {force: true});
      }
    },
    T,
  );
});
