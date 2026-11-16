// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `preview add` with a description adds a page only when build is
 * sure of its start: from the app shell, or from a page its page pick gives
 * less than a clear fit, it refuses, says why, and offers the nearest pages
 * by name. Build's own start is replaced per case, so each
 * path is judged on the preview's logic alone.
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
import {themeEditNew, themeEditPreviewAdd} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages, refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {CLEAR_FIT} from '../build/kit/start.mjs';

/** What build's start becomes in the next call; null keeps build's own. */
const startOverride = vi.hoisted(() => ({
  /** @type {null | ((start: any) => any)} */
  next: null,
  /** Build's ranked pages in the next call; null keeps build's own. @type {any[] | null} */
  pages: null,
}));

vi.mock('../build/build.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    build: async (/** @type {any[]} */ ...args) => {
      const r = await real.build(...args);
      if (startOverride.next && r?.data?.start)
        r.data.start = startOverride.next(r.data.start);
      if (startOverride.pages && r?.data) r.data.pages = startOverride.pages;
      return r;
    },
  };
});

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const CONCERT =
  'an event page for a concert with a date, venue, lineup and a buy tickets button';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-loose-start-', [
    ...FIXTURE_PACKAGES,
    '@types/react',
    '@types/react-dom',
    '@heroicons/react',
    'lucide-react',
    'recharts',
  ]);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  fs.writeFileSync(
    path.join(cwd, 'src/app/layout.tsx'),
    "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

beforeEach(() => {
  startOverride.next = null;
  startOverride.pages = null;
  fs.rmSync(path.join(cwd, 'src/app/theme-preview'), {
    recursive: true,
    force: true,
  });
});

describe('a page from a description', () => {
  it('is refused from the app shell, with the nearest pages by name', async () => {
    startOverride.next = s => ({
      ...s,
      name: 'shell-top-nav',
      basis: 'fallback',
      reason: 'No template matched, so start from the app shell.',
    });
    const e = await refusal(() =>
      themeEditPreviewAdd(CONCERT, {cwd, theme: 't'}),
    );
    expect(e.code).toBe('ERR_NOT_FOUND');
    expect(e.message).toContain(
      `No page template is a clear fit for "${CONCERT}": build starts this idea from the app shell.`,
    );
    expect(fs.existsSync(path.join(cwd, 'src/app/theme-preview'))).toBe(false);
    // The first line offered names a page, and it adds that page.
    const line = /** @type {string} */ (e.run[0]);
    const page = /--template (\S+)/.exec(line)?.[1];
    expect(page).toBeTruthy();
    startOverride.next = null;
    const added = await themeEditPreviewAdd(undefined, {
      cwd,
      theme: 't',
      template: page,
    });
    expect(added.data.added).toEqual([page]);
  }, 240_000);

  it('is refused from the app shell when a page id only shares a word with it', async () => {
    startOverride.next = s => ({
      ...s,
      name: 'shell-top-nav',
      basis: 'fallback',
      reason: 'No template matched, so start from the app shell.',
    });
    // "page" in the description is a word of table-page and detail-page's
    // ids, which is no name or keyword match.
    startOverride.pages = [
      {name: 'table-page', score: 40, reason: 'matches 1/9 terms: page'},
      {name: 'detail-page', score: 38, reason: 'matches 1/9 terms: page'},
    ];
    const e = await refusal(() =>
      themeEditPreviewAdd(CONCERT, {cwd, theme: 't'}),
    );
    expect(e.code).toBe('ERR_NOT_FOUND');
    expect(fs.existsSync(path.join(cwd, 'src/app/theme-preview'))).toBe(false);
  }, 240_000);

  it('is refused from a page build calls a loose fit, saying so', async () => {
    startOverride.next = s => ({
      ...s,
      name: 'payment-form',
      basis: 'closest',
      fit: CLEAR_FIT / 2,
    });
    const e = await refusal(() =>
      themeEditPreviewAdd(CONCERT, {cwd, theme: 't'}),
    );
    expect(e.code).toBe('ERR_NOT_FOUND');
    expect(e.message).toContain(
      `No page template is a clear fit for "${CONCERT}": build's closest, payment-form, is a loose fit.`,
    );
    expect(e.run[0]).toMatch(/preview add --template \S+ --theme t$/);
    expect(fs.existsSync(path.join(cwd, 'src/app/theme-preview'))).toBe(false);
  }, 240_000);

  it('is added from a page build gives a clear fit', async () => {
    startOverride.next = s => ({
      ...s,
      name: 'dashboard',
      basis: 'closest',
      fit: CLEAR_FIT,
    });
    const r = await themeEditPreviewAdd(CONCERT, {cwd, theme: 't'});
    expect(r.data.added.length).toBe(1);
  }, 240_000);

  it('is added from a closest page with no fit (a project without word weights)', async () => {
    // A project without word weights gives no fit, whatever build's own
    // start for the idea carries.
    startOverride.next = ({fit: _fit, ...s}) => ({
      ...s,
      name: 'dashboard',
      basis: 'closest',
    });
    const r = await themeEditPreviewAdd(CONCERT, {cwd, theme: 't'});
    expect(r.data.added.length).toBe(1);
  }, 240_000);

  it('is added for an idea build gives a clear page pick', async () => {
    const r = await themeEditPreviewAdd(
      'a settings page with profile, notifications and security',
      {cwd, theme: 't'},
    );
    expect(r.data.added.length).toBe(1);
  }, 240_000);

  it('is refused for an idea build gives only a loose page pick', async () => {
    const words =
      'a page for a sports team with fixtures, results and the squad';
    const e = await refusal(() =>
      themeEditPreviewAdd(words, {cwd, theme: 't'}),
    );
    expect(e.code).toBe('ERR_NOT_FOUND');
    expect(e.message).toContain(
      `No page template is a clear fit for "${words}"`,
    );
    expect(fs.existsSync(path.join(cwd, 'src/app/theme-preview'))).toBe(false);
  }, 240_000);

  it('is added for an idea build matches directly, whatever its fit', async () => {
    const r = await themeEditPreviewAdd('a login page', {cwd, theme: 't'});
    expect(r.data.added.length).toBe(1);
  }, 240_000);

  it('is never refused as a loose fit from a direct match', async () => {
    startOverride.next = s => ({
      ...s,
      name: 'dashboard',
      basis: 'direct',
      fit: CLEAR_FIT / 2,
    });
    const r = await themeEditPreviewAdd(CONCERT, {cwd, theme: 't'});
    expect(r.data.added.length).toBe(1);
  }, 240_000);

  it('is added from a closest start build gives no fit for', async () => {
    // The page pick scores no table template, so build reports no fit: no
    // signal, never a loose one.
    const r = await themeEditPreviewAdd('a table of orders', {cwd, theme: 't'});
    expect(r.data.added.length).toBe(1);
  }, 240_000);
});
