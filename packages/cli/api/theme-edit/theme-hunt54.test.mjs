// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt54: `new` and `show` give the exact steps that put the theme
 * into this app; a token set on a group names the members that read it
 * and what the others read, and a part that never reads it is refused.
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
  cwd = makeLinkedFixture('astryx-theme-hunt54-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('hunt54 (A): the wiring for this app', () => {
  it('outside a Next app: the root file, its imports, the Theme and the build', async () => {
    const r = await themeEditNew('w', {cwd, like: 'neutral'});
    const wiring = /** @type {any} */ (r.data).wiring.join('\n');
    expect(wiring).toContain("import {wTheme} from './themes/w/w'");
    expect(wiring).toContain("import './themes/w/w.css'");
    expect(wiring).toContain('<Theme theme={wTheme}>{children}</Theme>');
    expect(wiring).toContain('experimental theme compile themes/w/w.theme.ts');
  }, 120_000);

  it('in a Next app: paths from its root layout', async () => {
    const pkg = path.join(cwd, 'package.json');
    const kept = fs.readFileSync(pkg, 'utf8');
    fs.writeFileSync(
      pkg,
      JSON.stringify({
        ...JSON.parse(kept),
        dependencies: {'@astryxdesign/core': '*', next: '*'},
      }),
    );
    fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'src/app/layout.tsx'),
      "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
    );
    try {
      const r = await themeEditShow('w', {cwd});
      const wiring = /** @type {any} */ (r.data).wiring.join('\n');
      expect(wiring).toContain("in src/app/layout.tsx (the app's root layout)");
      expect(wiring).toContain("import {wTheme} from '../../themes/w/w'");
    } finally {
      fs.writeFileSync(pkg, kept);
      fs.rmSync(path.join(cwd, 'src'), {recursive: true, force: true});
    }
  }, 240_000);
});

describe('hunt54 (B): a token on a group', () => {
  it('names the members that read it and what the others read', async () => {
    const r = await themeEditSet('w', '--focus-outline-width', '2px', {
      cwd,
      on: 'inputs',
    });
    const note = String(/** @type {any} */ (r.data).setting.note);
    expect(note).toMatch(/read --focus-outline-width and take this change/);
    expect(note).toMatch(/text-input reads /);
  }, 120_000);

  it('a part that never reads it is refused for no effect', async () => {
    const err = await refusal(() =>
      themeEditSet('w', '--focus-outline-width', '2px', {
        cwd,
        on: 'text-input',
        only: true,
      }),
    );
    expect(err.code).toBe('ERR_THEME_NO_EFFECT');
  }, 120_000);
});
