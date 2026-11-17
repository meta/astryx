// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The pictures to open are named where people and agents look: a
 * change with --png says, in its see line, to open preview.png and
 * sheet-overlays.png (without --png, the pages); show --png says it on its
 * first line and its last, so a head or a tail of the output keeps it.
 */

import * as fs from 'node:fs';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {lookAtPictures} from './_context.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

// The renders are stood in for, and a picture is a few bytes where the
// browser would write it: these tests are about what the result says.
vi.mock('./_preview.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  const stubbed = (
    await import('../../test-utils/theme-render-stub.mjs')
  ).stubRenders(real);
  return {
    ...stubbed,
    screenshot: async (
      /** @type {any} */ _project,
      /** @type {string} */ _html,
      /** @type {string} */ png,
    ) => {
      fs.writeFileSync(png, 'png');
      return {ok: true};
    },
  };
});

const T = 240_000;
const LOOK =
  'open themes/t/preview.png (the sample page, a tooltip, a menu and a list drawn open below it) and themes/t/sheet-overlays.png (each control at rest, hovered, focused and pressed at its top, then every menu, tooltip, popover and list, drawn open); the -dark pictures show the dark mode';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-pictures-open-named-people-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('the pictures to open', () => {
  it.each([
    [[], null],
    [
      ['themes/t/preview.png', 'themes/t/preview-dark.png'],
      'open themes/t/preview.png (the sample page, a tooltip, a menu and a list drawn open below it); the -dark pictures show the dark mode',
    ],
    [
      ['themes/t/preview-dark.png', 'themes/t/sheet-overlays-dark.png'],
      'open themes/t/preview-dark.png (the sample page, a tooltip, a menu and a list drawn open below it) and themes/t/sheet-overlays-dark.png (each control at rest, hovered, focused and pressed at its top, then every menu, tooltip, popover and list, drawn open)',
    ],
    [['themes/t/sheet.png'], null],
    [
      [
        'themes/t/preview.png',
        'themes/t/sheet-overlays.png',
        'themes/t/sheet-inputs.png',
        'themes/t/sheet-navigation.png',
        'themes/t/sheet.png',
      ],
      'open themes/t/sheet-inputs.png, themes/t/sheet-navigation.png (one family of components each) and themes/t/preview.png (the sample page, a tooltip, a menu and a list drawn open below it) and themes/t/sheet-overlays.png (each control at rest, hovered, focused and pressed at its top, then every menu, tooltip, popover and list, drawn open)',
    ],
  ])('%j → %j', (files, want) => {
    expect(lookAtPictures(files)).toBe(want);
  });

  it(
    "a change's see line names the pictures it took, and the pages without --png",
    async () => {
      const taken = /** @type {any} */ (
        await themeEditSet('t', 'corners', 'square', {cwd, png: true})
      );
      expect(taken.data.see).toMatch(
        new RegExp(
          `^look without changing your app: ${LOOK.replace(/[.()]/g, '\\$&')}`,
        ),
      );
      const plain = /** @type {any} */ (
        await themeEditSet('t', 'corners', 'pill', {cwd})
      );
      expect(plain.data.see).toMatch(
        /^look without changing your app: astryx experimental theme editor show t --png writes themes\/t\/preview\.png .* and themes\/t\/sheet-overlays\.png .*; or open themes\/t\/preview\.html/,
      );
    },
    T,
  );

  it(
    'show --png says it first and last, and in the JSON',
    async () => {
      const r = /** @type {any} */ (await themeEditShow('t', {cwd, png: true}));
      expect(r.data.look).toBe(LOOK);
      const text = (
        await runCli(
          ['experimental', 'theme', 'editor', 'show', 't', '--png'],
          cwd,
        )
      ).stdout
        .trim()
        .split('\n');
      expect(text[0]).toBe(`look: ${LOOK}`);
      expect(text.at(-1)).toBe(`look: ${LOOK}`);
      const without = (
        await runCli(['experimental', 'theme', 'editor', 'show', 't'], cwd)
      ).stdout;
      expect(without).not.toContain('look: open');
    },
    T,
  );
});
