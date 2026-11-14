// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file More of the fifteenth pass: a theme source's own imports count as
 * the source, a broken source line never sends show back to itself, an
 * editor theme compiles from the app root, disabled reaches a form
 * control's wrapper only, and a step back writes the same color files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {editorCompileProblem} from './_adapter.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt15b-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} file */
const at = (slug, file) => path.join(cwd, 'themes', slug, file);

describe('hunt15b', () => {
  it('F8-N6: show builds a change in a module the theme source imports', async () => {
    await themeEditNew('g', {cwd});
    fs.writeFileSync(
      at('g', 'my-tokens.ts'),
      "export const myAccent = '#0000ff';\n",
    );
    const ts = at('g', 'g.theme.ts');
    fs.writeFileSync(
      ts,
      fs
        .readFileSync(ts, 'utf8')
        .replace(
          "import {gSettings} from './g.settings';",
          "import {gSettings} from './g.settings';\nimport {myAccent} from './my-tokens';",
        )
        .replace(
          "name: 'g',",
          "name: 'g',\n  tokens: {'--color-accent': myAccent},",
        ),
    );
    await themeEditShow('g', {cwd});
    fs.writeFileSync(
      at('g', 'my-tokens.ts'),
      "export const myAccent = '#ff0000';\n",
    );
    await themeEditShow('g', {cwd});
    expect(fs.readFileSync(at('g', 'g.css'), 'utf8')).toMatch(/#ff0000/i);
  }, 240_000);

  it('F8-N4: an unreadable build with a broken source line never suggests show', async () => {
    await themeEditNew('b', {cwd});
    fs.appendFileSync(at('b', 'b.js'), 'garbage(\n');
    const ts = at('b', 'b.theme.ts');
    fs.writeFileSync(
      ts,
      fs.readFileSync(ts, 'utf8').replace("'./b.settings'", "'./b.setings'"),
    );
    const r = await refusal(() => themeEditShow('b', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.run.join(' ')).not.toMatch(/ show b/);
  }, 240_000);

  it('F8-N7: compile of an editor theme from a subfolder names the root', async () => {
    const sub = path.join(cwd, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});
    const r = await editorCompileProblem(['../../themes/g/g.theme.ts'], {
      cwd: sub,
    });
    expect(r?.suggestions?.[0]?.name).toMatch(
      /^cd \.\.\/\.\. && .* experimental theme compile themes\/g\/g\.theme\.ts$/,
    );
  }, 240_000);

  it('R10-G: disabled reaches a form control wrapper, never an action group', async () => {
    await themeEditSet('g', 'opacity', '0.4', {
      cwd,
      on: 'typeahead',
      state: 'disabled',
    });
    await themeEditSet('g', 'opacity', '0.4', {
      cwd,
      on: 'segmented-control',
      state: 'disabled',
    });
    const css = fs.readFileSync(at('g', 'g.css'), 'utf8');
    expect(css).toMatch(
      /\.astryx-typeahead:is\(:disabled,\[aria-disabled="true"\],:has\(/,
    );
    expect(css).toMatch(
      /\.astryx-segmented-control:is\(:disabled,\[aria-disabled="true"\]\)\s*\{/,
    );
  }, 240_000);

  it('R10-F: a plain undo after a scoped undo writes the same color files', async () => {
    await themeEditNew('c1', {cwd});
    await themeEditSet('c1', 'info', 'white', {cwd});
    await themeEditSet('c1', 'success', 'oklch(0.6 0.2 30)', {cwd});
    const before = fs.readFileSync(at('c1', 'palette.config.json'), 'utf8');
    await themeEditUndo('c1', {cwd, thing: 'info'});
    await themeEditUndo('c1', {cwd});
    expect(fs.readFileSync(at('c1', 'palette.config.json'), 'utf8')).toBe(
      before,
    );
  }, 240_000);
});
