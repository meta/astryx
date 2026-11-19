// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Removing the whole preview from an app made by `preview app` takes
 * the starter's home page link to it too; a home page changed by hand that
 * still links there is named.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewApp,
  themeEditPreviewRemove,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-starter-home-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('removing the preview from a starter app', () => {
  beforeEach(() =>
    fs.rmSync(path.join(cwd, 'q'), {recursive: true, force: true}),
  );

  it(
    "takes the home page's link to it",
    async () => {
      await themeEditPreviewApp('q', {cwd, theme: 't'});
      const app = path.join(cwd, 'q');
      const home = path.join(app, 'src/app/page.tsx');
      expect(fs.readFileSync(home, 'utf8')).toContain('href="/theme-preview"');
      const r = await themeEditPreviewRemove(undefined, {cwd: app});
      expect(fs.existsSync(path.join(app, 'src/app/theme-preview'))).toBe(
        false,
      );
      const after = fs.readFileSync(home, 'utf8');
      expect(after).not.toContain('/theme-preview');
      expect(after).not.toContain('@astryxdesign/core/Link');
      expect(r.data.rewritten).toEqual(['src/app/page.tsx']);
      expect(r.data.notes.join(' ')).toContain(
        'no longer links to /theme-preview',
      );
    },
    T,
  );

  it(
    'names a home page changed by hand that still links to it',
    async () => {
      await themeEditPreviewApp('q', {cwd, theme: 't'});
      const app = path.join(cwd, 'q');
      const home = path.join(app, 'src/app/page.tsx');
      const mine = fs
        .readFileSync(home, 'utf8')
        .replace('Theme preview app', 'My app');
      fs.writeFileSync(home, mine);
      const r = await themeEditPreviewRemove(undefined, {cwd: app});
      expect(fs.readFileSync(home, 'utf8')).toBe(mine);
      expect(r.data.rewritten).toEqual([]);
      expect(r.data.notes.join(' ')).toContain(
        'still links to /theme-preview, which no longer exists',
      );
    },
    T,
  );
});
