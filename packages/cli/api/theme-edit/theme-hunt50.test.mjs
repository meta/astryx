// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fiftieth pass over `astryx experimental theme editor`: a
 * [light, dark] pair on a token that is not a color is refused however the
 * theme file writes it and from `compile` too, a state block the file sets
 * on a part is named, compile names the undo for a refused saved value,
 * and the phone note names the fix within Core's contract.
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
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt50-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} body @param {string} [head] */
const source = (slug, body, head = '') =>
  fs.writeFileSync(
    path.join(cwd, `themes/${slug}/${slug}.theme.ts`),
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {${slug}Settings} from './${slug}.settings';\n${head}export const ${slug}Theme = defineTheme({extends: ${slug}Settings, name: '${slug}', ${body}});\n`,
  );
/** @param {any} r */
const notes = r => (r.data.notes ?? []).join('\n');

describe('hunt50', () => {
  it('F21-N1: a shadow pair is refused (light-dark takes only colors)', async () => {
    await themeEditNew('sp', {cwd});
    source(
      'sp',
      "tokens: {'--shadow-low': ['0 1px 2px #0003', '0 1px 2px #0008']}",
    );
    const r = await refusal(() => themeEditShow('sp', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.message).toMatch(/--shadow-low a \[light, dark\] pair/);
  }, 240_000);

  it.each([
    ['as const', "tokens: {'--radius-page': ['8px', '24px'] as const}", ''],
    [
      'a constant',
      "tokens: {'--radius-page': pair}",
      "const pair = ['8px', '24px'];\n",
    ],
    [
      'an imported spread',
      'tokens: {...sizes}',
      "import {sizes} from './sizes';\n",
    ],
  ])(
    'F21-N2: a pair written as %s is refused by the editor and by compile',
    async (label, body, head) => {
      const slug = `p${label.replace(/\W/g, '').slice(0, 6)}`;
      await themeEditNew(slug, {cwd});
      fs.writeFileSync(
        path.join(cwd, `themes/${slug}/sizes.ts`),
        "export const sizes = {'--radius-page': ['8px', '24px']};\n",
      );
      source(slug, body, head);
      const r = await refusal(() => themeEditShow(slug, {cwd}));
      expect(r.message).toMatch(/--radius-page a \[light, dark\] pair/);
      const c = await editorCompileProblem(
        [`themes/${slug}/${slug}.theme.ts`],
        {cwd},
      );
      expect(c?.message).toMatch(/--radius-page a \[light, dark\] pair/);
    },
    240_000,
  );

  it('F21-N3: a state block the file sets on a part is named in set, show and undo', async () => {
    await themeEditNew('st', {cwd});
    source(
      'st',
      "components: {button: {base: {':hover': {backgroundColor: 'red'}}}}",
    );
    await themeEditShow('st', {cwd});
    const set = await themeEditSet('st', 'background-color', 'blue', {
      cwd,
      on: 'button',
      state: 'hover',
    });
    expect(notes(set)).toMatch(
      /st\.theme\.ts sets background-color on button :hover itself \(red\)/,
    );
    const shown = await themeEditShow('st', {cwd});
    expect(notes(shown)).toMatch(/on button :hover: st\.theme\.ts sets/);
    expect(notes(shown)).not.toMatch(
      /not checked: text contrast for background-color = blue/,
    );
    const undo = await themeEditUndo('st', {
      cwd,
      thing: 'background-color',
      on: 'button',
      state: 'hover',
    });
    expect(/** @type {any} */ (undo.data).now).toMatch(
      /background-color = red on button :hover \(set in st\.theme\.ts\)/,
    );
  }, 240_000);

  it('F21-N4: compile names the undo for a saved value the editor refuses', async () => {
    await themeEditNew('sv', {cwd});
    await themeEditSet('sv', '--radius-page', '12px', {cwd});
    const file = path.join(cwd, 'themes/sv/sv.settings.json');
    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replace('"12px"', '"12"'),
    );
    const c = await editorCompileProblem(['themes/sv/sv.theme.ts'], {cwd});
    expect(c?.message).toMatch(/holds a value the editor no longer accepts/);
    expect(JSON.stringify(c?.suggestions)).toMatch(/undo sv --radius-page/);
  }, 240_000);

  it('the phone note names the fix within the contract', async () => {
    await themeEditNew('pn', {cwd, like: 'neutral'});
    source('pn', "tokens: {'--font-family-heading': 'Georgia, serif'}");
    const r = await themeEditShow('pn', {cwd});
    expect(notes(r)).toMatch(/typography: \{heading: \{family: \.\.\.\}\}/);
    expect(notes(r)).not.toMatch(/Core limit/);
  }, 240_000);
});
