// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file An editor theme's own modules, its source and its fonts, read as
 * the build reads them: an icon registry in a module of the theme's folder
 * loads in the editor's checks and is carried by the app copy; a source
 * whose tokens replace the settings' is refused by name; a source name cut
 * short, or a folder typed in other letters, is offered the source; an
 * empty --out is refused; a weight in a font shorthand is loaded, and
 * weights are judged per family; the stable build names the app copy it
 * leaves; a copy's compile with --out in the theme's folder offers a line
 * compile takes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {builtFontWeights} from './_settings.mjs';
import {openProject} from './_project.mjs';
import {themeSourceGuesses} from '../theme/build/build.mjs';
import {fontShorthandWeight} from '../theme/build/font-warning.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;
const COMPILE = ['experimental', 'theme', 'compile'];

/** @type {string} */
let cwd;
/** @type {string} */
let dir;
/** @type {string} */
let fresh;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt187-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  dir = path.join(cwd, 'themes/t');
  fresh = fs.readFileSync(path.join(dir, 't.theme.ts'), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** Put the theme source back as the editor wrote it, and build it. */
const restore = async () => {
  fs.writeFileSync(path.join(dir, 't.theme.ts'), fresh);
  await runCli([...COMPILE, 'themes/t/t.theme.ts'], cwd);
};

describe('an icon registry in a module of the theme folder', () => {
  it(
    "loads in the editor's checks, and the app copy carries the compiled module",
    async () => {
      fs.writeFileSync(
        path.join(dir, 'icons.ts'),
        "import * as React from 'react';\nconst MyCheck = () => React.createElement('span', null, 'v');\nexport const icons = {check: MyCheck};\n",
      );
      fs.writeFileSync(
        path.join(dir, 't.theme.ts'),
        "import {defineTheme} from '@astryxdesign/core/theme';\nimport {tSettings} from './t.settings';\nimport {icons} from './icons';\nexport const tTheme = defineTheme({extends: tSettings, name: 't', icons});\n",
      );
      try {
        const built = await runCli([...COMPILE, 'themes/t/t.theme.ts'], cwd);
        expect(built.stdout + built.stderr).not.toContain(
          'the app copy in src/themes/t/ was not updated',
        );
        const set = /** @type {any} */ (
          await themeEditSet('t', 'corners', 'pill', {cwd})
        );
        expect(set.data.notChecked).toBeNull();
        await themeEditShow('t', {cwd});
        // The build compiles the registry beside its module, and the app
        // copy carries the compiled module the copied build imports.
        expect(
          fs.readFileSync(path.join(cwd, 'src/themes/t/t.js'), 'utf8'),
        ).toContain("from './t.modules/icons.ts.js'");
        const copy = path.join(cwd, 'src/themes/t/t.modules/icons.ts.js');
        const carried = fs.readFileSync(copy, 'utf8');
        expect(carried).toContain('export const icons = {');
        expect(carried).toContain('check: MyCheck');
        const check = await runCli(
          [...COMPILE, 'themes/t/t.theme.ts', '--check'],
          cwd,
        );
        expect(check.status).toBe(0);
      } finally {
        fs.rmSync(path.join(dir, 'icons.ts'), {force: true});
        fs.rmSync(path.join(cwd, 'src/themes/t/icons.ts'), {force: true});
        await restore();
      }
    },
    T,
  );
});

describe("a source whose tokens replace the settings'", () => {
  it(
    'is refused by name: a change would be saved and never built',
    async () => {
      fs.writeFileSync(
        path.join(dir, 't.theme.ts'),
        "import {defineTheme} from '@astryxdesign/core/theme';\nimport {tSettings} from './t.settings';\nexport const tTheme = {...defineTheme({extends: tSettings, name: 't'}), tokens: {'--color-accent': '#ff0000'}};\n",
      );
      try {
        const e = await refusal(() =>
          themeEditSet('t', 'corners', 'square', {cwd}),
        );
        expect(e.message).toMatch(
          /^t\.theme\.ts replaces the tokens of tSettings: \d+ of the \d+ tokens the settings set \(.*\) do not reach the theme it exports, so settings cannot take effect\. Give your own tokens inside defineTheme\(/,
        );
      } finally {
        await restore();
      }
    },
    T,
  );
});

describe('a source name cut short, or its folder in other letters', () => {
  it('is offered the theme source', () => {
    for (const typed of [
      'themes/t/t',
      'themes/t/t.theme.',
      'themes/t/t.theme',
      'themes/T/t.theme.ts',
    ])
      expect(themeSourceGuesses(typed, cwd), typed).toEqual([
        'themes/t/t.theme.ts',
      ]);
  });
});

describe('an empty --out', () => {
  it(
    'is refused, and nothing is written',
    async () => {
      const r = await runCli(
        [...COMPILE, 'themes/t/t.theme.ts', '--out', '', '--json'],
        cwd,
      );
      expect(r.status).toBe(1);
      expect(JSON.parse(r.stdout).error).toContain('--out is empty');
    },
    T,
  );
});

describe('font weights', () => {
  it("a font shorthand's weight is read", () => {
    expect(fontShorthandWeight('300 16px Pacifico, cursive')).toBe('300');
    expect(fontShorthandWeight('italic 800 16px/1.2 Pacifico, cursive')).toBe(
      '800',
    );
    expect(fontShorthandWeight('italic bold 1rem Lora')).toBe('bold');
    expect(fontShorthandWeight('16px Lora')).toBeNull();
  });

  it(
    'are loaded from a shorthand, and judged per family',
    async () => {
      fs.writeFileSync(
        path.join(dir, 't.theme.ts'),
        "import {defineTheme} from '@astryxdesign/core/theme';\nimport {tSettings} from './t.settings';\nexport const tTheme = defineTheme({extends: tSettings, name: 't', components: {button: {base: {font: '300 16px Pacifico, cursive'}}}});\n",
      );
      try {
        await runCli([...COMPILE, 'themes/t/t.theme.ts'], cwd);
        const project = await openProject(cwd);
        const ctx = /** @type {any} */ ({project});
        // Every weight, the shorthand's 300 among them.
        expect(builtFontWeights(ctx, 't')).toContain(300);
        // Pacifico text takes 300; the theme's own family does not.
        expect(builtFontWeights(ctx, 't', 'Pacifico')).toContain(300);
        expect(builtFontWeights(ctx, 't', 'Figtree')).not.toContain(300);
      } finally {
        await restore();
      }
    },
    T,
  );
});

describe('the stable build of an editor theme', () => {
  it(
    'names the app copy it does not write, and the compile that does',
    async () => {
      const r = await runCli(['theme', 'build', 'themes/t/t.theme.ts'], cwd);
      expect(r.stdout + r.stderr).toContain(
        'It does not write the app copy in src/themes/t/, which the app imports;',
      );
      expect(r.stdout + r.stderr).toMatch(
        /experimental theme compile themes\/t\/t\.theme\.ts builds it and writes the copy/,
      );
      const check = await runCli(
        ['theme', 'build', 'themes/t/t.theme.ts', '--check'],
        cwd,
      );
      expect(check.stdout + check.stderr).toContain(
        'It does not check the app copy in src/themes/t/',
      );
    },
    T,
  );
});

describe('compiling a theme by name with --out in its own folder', () => {
  it(
    'offers only lines compile takes',
    async () => {
      const r = await runCli(
        [...COMPILE, 't', '--out', 'themes/t/out.css', '--json'],
        cwd,
      );
      const names = (JSON.parse(r.stdout).suggestions ?? []).map(
        (/** @type {any} */ s) => s.name,
      );
      for (const n of names) expect(n).not.toContain('--out themes/t/out.css');
      expect(names).toContainEqual(
        expect.stringMatching(
          / experimental theme compile themes\/t\/t\.theme\.ts$/,
        ),
      );
      expect(new Set(names).size).toBe(names.length);
    },
    T,
  );
});
