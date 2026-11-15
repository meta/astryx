// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file #11468 round 4: a show that is refused leaves the app copy as it
 * was; system files in the copy do not stop it; a file of yours there stops
 * it, and `wiring` then gives the steps by hand, naming that file; a folder
 * left with only system files (or empty) is written again.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt60-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');

describe('round 4 (1): a refused show', () => {
  it('leaves the app copy as it was', async () => {
    await themeEditNew('r', {cwd});
    const before = read('src/themes/r/r.css');
    fs.writeFileSync(
      path.join(cwd, 'themes/r/r.theme.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nimport {rSettings} from './r.settings';\nconst pair = ['8px', '24px'];\nexport const rTheme = defineTheme({extends: rSettings, name: 'r', tokens: {'--radius-page': pair}});\n",
    );
    const err = await refusal(() => themeEditShow('r', {cwd}));
    expect(err.message).toMatch(/--radius-page a \[light, dark\] pair/);
    expect(read('src/themes/r/r.css')).toBe(before);
    expect(read('src/themes/r/r.css')).not.toContain('light-dark(8px, 24px)');
  }, 240_000);
});

describe('round 4 (2): what is in the copy folder', () => {
  it('a system file does not stop the copy', async () => {
    await themeEditNew('j', {cwd});
    fs.writeFileSync(path.join(cwd, 'src/themes/j/.DS_Store'), '');
    const before = read('src/themes/j/j.css');
    await themeEditSet('j', 'corners', 'pill', {cwd});
    expect(read('src/themes/j/j.css')).not.toBe(before);
    expect(fs.existsSync(path.join(cwd, 'src/themes/j/.DS_Store'))).toBe(true);
  }, 240_000);

  it('a folder left with only system files, or empty, is written again', async () => {
    for (const [slug, leftover] of [
      ['e', ['.DS_Store']],
      ['f', []],
    ]) {
      await themeEditNew(slug, {cwd});
      const dir = path.join(cwd, 'src/themes', slug);
      // What `git rm -r` or a branch switch leaves behind.
      fs.rmSync(dir, {recursive: true, force: true});
      fs.mkdirSync(dir, {recursive: true});
      for (const name of leftover) fs.writeFileSync(path.join(dir, name), '');
      await themeEditSet(slug, 'corners', 'pill', {cwd});
      expect(fs.existsSync(path.join(dir, `${slug}.css`))).toBe(true);
      expect(read(`src/themes/${slug}/${slug}.css`)).toContain('9999px');
      const shown = await themeEditShow(slug, {cwd});
      const wiring = /** @type {any} */ (shown.data).wiring.join('\n');
      expect(wiring).toMatch(new RegExp(` theme add ${slug}:`));
      expect(wiring).not.toContain("is not the editor's");
    }
  }, 240_000);

  it('a file of yours at a copy name stops it, and wiring gives the steps by hand naming it', async () => {
    // (A file at another name no longer stops it: hunt62.)
    await themeEditNew('n', {cwd});
    fs.writeFileSync(path.join(cwd, 'src/themes/n/nTheme.ts'), '// mine\n');
    const before = read('src/themes/n/n.css');
    const r = await themeEditSet('n', 'corners', 'pill', {cwd});
    expect(read('src/themes/n/n.css')).toBe(before);
    const shown = await themeEditShow('n', {cwd});
    const wiring = /** @type {any} */ (shown.data).wiring.join('\n');
    expect(wiring).toContain('src/themes/n/nTheme.ts is yours');
    expect(wiring).toContain('<Theme theme={nTheme}');
    expect(wiring).not.toMatch(/ theme add n:/);
    expect(r.data.setting.value).toBe('pill');
  }, 240_000);
});
