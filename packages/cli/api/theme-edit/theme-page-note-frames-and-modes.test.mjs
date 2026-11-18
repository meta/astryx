// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page note reaches the other ways an agent changes the page: a
 * theme made one-mode (its page then drawn for that mode only) says it once,
 * and a fill on the main panel (layout-content) or the shell's frame around
 * it (layout) points at the page color, with the note. An app embedded in a
 * page it does not own (no Core reset) gets no note.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-page-note-frames-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const NOTE = /page color shows inside AppShell/;

/** @param {any} r */
const notes = r => JSON.stringify(r?.data?.notes ?? []);

it('a theme made dark-only says the page note once', async () => {
  await themeEditNew('m1', {cwd, like: 'neutral'});
  const first = await themeEditSet('m1', 'mode', 'dark-only', {cwd});
  expect(notes(first)).toMatch(NOTE);
  const back = await themeEditSet('m1', 'mode', 'both', {cwd});
  expect(notes(back)).not.toMatch(NOTE);
  const lightOnly = await themeEditSet('m1', 'mode', 'light-only', {cwd});
  expect(notes(lightOnly)).toMatch(NOTE);
  const again = await themeEditSet('m1', 'mode', 'dark-only', {cwd});
  expect(notes(again)).not.toMatch(NOTE);
}, 300_000);

it('a fill on the main panel points at the page color, with the note', async () => {
  await themeEditNew('m2', {cwd, like: 'neutral'});
  const r = await themeEditSet('m2', 'background-color', '#c0c0c0', {
    cwd,
    on: 'layout-content',
  });
  expect(notes(r)).toMatch(
    /layout-content is the main panel the app shell draws over the page.*set m2 --color-background-body '#c0c0c0'/,
  );
  expect(notes(r)).toMatch(NOTE);
}, 300_000);

it('a fill on the shell frame around it is refused with the page color first', async () => {
  await themeEditNew('m3', {cwd, like: 'neutral'});
  /** @type {any} */
  let error = null;
  try {
    await themeEditSet('m3', 'background-color', '#c0c0c0', {
      cwd,
      on: 'layout',
    });
  } catch (e) {
    error = e;
  }
  expect(String(error?.message)).toMatch(
    /for the page itself, set --color-background-body/,
  );
  expect(String(error?.message)).toMatch(NOTE);
  expect(JSON.stringify(error?.details ?? error?.run ?? error)).toMatch(
    /set m3 --color-background-body '#c0c0c0'/,
  );
}, 300_000);

it('an app embedded in a page it does not own gets no page note', async () => {
  // (App source that loads no Core reset: the guest setup.)
  const app = path.join(cwd, 'src/widget.tsx');
  fs.mkdirSync(path.dirname(app), {recursive: true});
  fs.writeFileSync(app, 'export const W = () => null;\n');
  try {
    await themeEditNew('m4', {cwd, like: 'neutral'});
    const r = await themeEditSet('m4', 'mode', 'dark-only', {cwd});
    expect(notes(r)).not.toMatch(NOTE);
  } finally {
    fs.rmSync(app);
  }
}, 300_000);
