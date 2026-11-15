// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A link at a picture's name, to a file or to nothing, is never
 * written through or replaced: that one picture is skipped and named, and
 * the other pictures of the run are taken. `preview app --theme` never
 * reads through a link in the theme folder: it leaves the link out and
 * names it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditPreviewApp} from './theme-edit.mjs';
import {pictures} from './_context.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The renders are stood in for, and a picture is a few bytes written where
// the browser would write it: these tests are about which paths are written.
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

/** @type {string} */
let cwd;
/** @type {string} */
let outside;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-picture-links-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-mine-'));
  fs.writeFileSync(path.join(outside, 'mine.png'), 'mine');
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
  if (outside) fs.rmSync(outside, {recursive: true, force: true});
});

describe("a link at a picture's name", () => {
  for (const [kind, to] of /** @type {const} */ ([
    ['a file', 'mine'],
    ['nothing', 'gone'],
  ]))
    it.skipIf(process.platform === 'win32')(
      `to ${kind} keeps that one picture out, untouched, and the others are taken`,
      async () => {
        const dir = path.join(cwd, 'themes/t');
        const target =
          to === 'mine'
            ? path.join(outside, 'mine.png')
            : path.join(outside, 'gone.png');
        const preview = path.join(dir, 'preview.png');
        const sheet = path.join(dir, 'sheet.png');
        fs.rmSync(preview, {force: true});
        fs.rmSync(sheet, {force: true});
        fs.symlinkSync(target, preview);
        try {
          const r = await pictures(
            /** @type {any} */ ({cwd}),
            [
              {html: path.join(dir, 'preview.html'), png: preview},
              {html: path.join(dir, 'sheet.html'), png: sheet},
            ],
            ['light'],
          );
          expect(r.files).toEqual(['themes/t/sheet.png']);
          expect(r.problem).toContain(
            `themes/t/preview.png (to ${target}${to === 'gone' ? ', which does not exist' : ''}) is a link, and a picture is never written through or over a link, so that picture was not taken; themes/t/sheet.png was taken`,
          );
          // The link is still a link, pointing where it did, and nothing
          // was written through it.
          expect(fs.lstatSync(preview).isSymbolicLink()).toBe(true);
          expect(fs.readlinkSync(preview)).toBe(target);
          if (to === 'mine')
            expect(fs.readFileSync(target, 'utf8')).toBe('mine');
          else expect(fs.existsSync(target)).toBe(false);
        } finally {
          fs.rmSync(preview, {force: true});
          fs.rmSync(sheet, {force: true});
          fs.rmSync(path.join(dir, 't.pictures.json'), {force: true});
        }
      },
      120_000,
    );
});

describe('preview app --theme and links in the theme folder', () => {
  it.skipIf(process.platform === 'win32')(
    'leaves a link out, names it, and copies the regular files',
    async () => {
      const dir = path.join(cwd, 'themes/t');
      fs.symlinkSync(
        path.join(outside, 'mine.png'),
        path.join(dir, 'sheet-mockup.png'),
      );
      fs.writeFileSync(path.join(dir, 'sheet-old.png'), 'mine');
      try {
        const r = await themeEditPreviewApp('starter', {cwd, theme: 't'});
        const copied = path.join(cwd, 'starter/themes/t');
        expect(fs.existsSync(path.join(copied, 'sheet-old.png'))).toBe(true);
        expect(
          fs.lstatSync(path.join(copied, 'sheet-mockup.png'), {
            throwIfNoEntry: false,
          }),
        ).toBeUndefined();
        expect(r.data.notes).toContainEqual(
          expect.stringMatching(
            /^left out themes\/t\/sheet-mockup\.png: a link, which the copy does not follow/,
          ),
        );
      } finally {
        fs.rmSync(path.join(dir, 'sheet-mockup.png'), {force: true});
        fs.rmSync(path.join(dir, 'sheet-old.png'), {force: true});
        fs.rmSync(path.join(cwd, 'starter'), {recursive: true, force: true});
      }
    },
    240_000,
  );
});
