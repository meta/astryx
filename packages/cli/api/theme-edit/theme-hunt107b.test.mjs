// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A font no package loads is named with the install line of the
 * package its family maps to, and loads like any font package once that
 * package is installed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt107b-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');

describe('a font no package loads', () => {
  it('names the install line of its family package, and loads it once installed', async () => {
    await themeEditNew('r', {cwd});
    const value = "'Press Start 2P', monospace";
    const before = await themeEditSet('r', 'font', value, {cwd});
    const note = before.data.notes.join(' ');
    expect(note).toContain('no package loads it');
    expect(note).toContain('@fontsource/press-start-2p');
    const pkg = path.join(
      path.dirname(cwd),
      'node_modules/@fontsource/press-start-2p',
    );
    fs.mkdirSync(pkg, {recursive: true});
    fs.writeFileSync(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        name: '@fontsource/press-start-2p',
        version: '5.0.0',
        exports: {
          '.': './index.css',
          './index.css': './index.css',
          './package.json': './package.json',
        },
      }),
    );
    fs.writeFileSync(
      path.join(pkg, 'index.css'),
      "@font-face {\n  font-family: 'Press Start 2P';\n  src: url(./p.woff2);\n}\n",
    );
    try {
      const after = await themeEditShow('r', {cwd});
      expect(JSON.stringify(after.data.notes ?? [])).not.toContain(
        'no package loads it',
      );
      expect(read('src/themes/r/r.fonts.css')).toContain(
        '@fontsource/press-start-2p/index.css',
      );
    } finally {
      fs.rmSync(pkg, {recursive: true, force: true});
    }
  }, 240_000);
});
