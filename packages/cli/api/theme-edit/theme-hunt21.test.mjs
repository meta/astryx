// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twenty-first pass over `astryx experimental theme editor`: a
 * pair whose present half holds commas, CommonJS and import-equals helpers
 * in the source fingerprint, and a stylesheet another theme's build wrote.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {loadTheme, staleBuild} from './_settings.mjs';
import {themeFileImports} from '../../foundation/discovery/theme-discovery.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt21-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} file */
const at = (slug, file) => path.join(cwd, 'themes', slug, file);

describe('hunt21', () => {
  it('F11-N1: a pair with a missing half is refused when the other half has commas', async () => {
    await themeEditNew('p', {cwd});
    const ts = at('p', 'p.theme.ts');
    fs.writeFileSync(
      ts,
      fs
        .readFileSync(ts, 'utf8')
        .replace(
          "name: 'p',",
          "name: 'p',\n  tokens: {'--color-accent': ['rgb(0, 0, 0)', null]},",
        ),
    );
    const r = await refusal(() => themeEditShow('p', {cwd}));
    expect(r.message).toMatch(/not text/);
  }, 240_000);

  it('F11-N2: require() and import-equals count as the source imports', () => {
    const file = path.join(cwd, 'req.ts');
    fs.writeFileSync(
      file,
      "const a = require('./a.cjs');\nimport b = require('./b');\nimport c from './c';\n",
    );
    expect(themeFileImports(file)).toEqual(['./c']);
    expect(themeFileImports(file, {withRequire: true}).sort()).toEqual([
      './a.cjs',
      './b',
      './c',
    ]);
  });

  it('F11-N3: a stylesheet another theme built is not current', async () => {
    await themeEditNew('g', {cwd});
    const css = at('g', 'g.css');
    fs.writeFileSync(
      css,
      fs
        .readFileSync(css, 'utf8')
        .replace(/^ \* Source: .*$/m, ' * Source: other.theme.ts'),
    );
    expect(staleBuild(cwd, 'g', loadTheme(cwd, 'g'))).toMatch(
      /g\.css was built from other\.theme\.ts/,
    );
  }, 240_000);
});

describe('hunt21, R03-05-07 final 11', () => {
  it('N11-1/2: a number suggestion gets px per token, in range, never a reset', async () => {
    await themeEditNew('v', {cwd});
    /** @param {string} prop @param {string} value */
    const run = async (prop, value) =>
      (await refusal(() => themeEditSet('v', prop, value, {cwd, on: 'card'})))
        .run[0];
    expect(await run('border-width', '-2')).toMatch(
      / border-width 2px --on card$/,
    );
    expect(await run('padding', '4 8px')).toMatch(
      / padding '4px 8px' --on card$/,
    );
    expect(await run('margin', '4 auto')).toMatch(
      / margin '4px auto' --on card$/,
    );
    expect(await run('padding', '4 px')).toMatch(/ padding 4px --on card$/);
  }, 240_000);

  it('N11-3: a plain word for a group names the group', async () => {
    const r = await refusal(() =>
      themeEditSet('v', 'border-color', 'red', {cwd, on: 'checkboxes'}),
    );
    expect(r.run[0]).toMatch(/ --on checks$/);
  });

  it('N11-4: a comparative steps from the value now', async () => {
    await themeEditSet('v', 'corners', 'medium', {cwd});
    expect(
      (await themeEditSet('v', 'corners', 'sharper', {cwd})).data.setting.value,
    ).toBe('small');
    expect(
      (await themeEditSet('v', 'corners', 'rounder', {cwd})).data.setting.value,
    ).toBe('medium');
  }, 240_000);

  it('N11-5: a state in another spelling is the state', async () => {
    const r = await themeEditSet('v', 'outline-color', '#ff0000', {
      cwd,
      on: 'button',
      state: 'focusVisible',
    });
    expect(r.data.setting.state).toBe('focus-visible');
  }, 240_000);
});

describe('hunt21, chaos13', () => {
  it('R13-A: themes as a file is refused by every command, naming the fix', async () => {
    const app = makeLinkedFixture(
      'astryx-theme-hunt21-file-',
      FIXTURE_PACKAGES,
    );
    try {
      fs.writeFileSync(path.join(app, 'themes'), 'hi\n');
      const {themeEditHow, themeEditUndo} = await import('./theme-edit.mjs');
      for (const run of [
        () => themeEditShow('g', {cwd: app}),
        () => themeEditSet('g', 'corners', 'pill', {cwd: app}),
        () => themeEditUndo('g', {cwd: app}),
        () => themeEditHow('corners', {cwd: app}),
      ]) {
        const r = await refusal(run);
        expect(r.code).toBe('ERR_FILE_EXISTS');
        expect(r.run[0]).toBe('ls -la themes');
      }
    } finally {
      removeLinkedFixture(app);
    }
  }, 240_000);
});
