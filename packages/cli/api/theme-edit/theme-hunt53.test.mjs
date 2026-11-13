// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file #11453 follow-up: pictures carry the editor stamp; a picture an
 * older editor took (no record) is adopted only when it is the editor's
 * 1280-pixel window; a link to a file of the user's is left alone; a `new`
 * refused for its name drops a vibrancy that would change nothing.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {adoptOlderPicture, editorWrote, recordWritten} from './_settings.mjs';
import {pictures} from './_context.mjs';
import {EDITOR_STAMP, pngTexts, withPngText} from './_png.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt53-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** A PNG header and end only, `width` pixels wide. @param {number} width */
const png = width => {
  /** @param {string} type @param {Buffer} data */
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

describe('#11453: the editor stamp and older pictures', () => {
  it('a stamped picture is the editor’s, for its own theme only', () => {
    const file = path.join(cwd, 'themes/t/sheet.png');
    fs.writeFileSync(file, withPngText(png(1280), EDITOR_STAMP, 't'));
    expect(pngTexts(fs.readFileSync(file))[EDITOR_STAMP]).toBe('t');
    expect(editorWrote(cwd, 't', file)).toBe(true);
    fs.writeFileSync(file, withPngText(png(1280), EDITOR_STAMP, 'other'));
    expect(editorWrote(cwd, 't', file)).toBe(false);
    fs.rmSync(file);
  });

  it('an older picture is adopted only as the editor’s window, while no record exists', () => {
    const dir = path.join(cwd, 'themes/t');
    fs.rmSync(path.join(dir, 't.pictures.json'), {force: true});
    fs.writeFileSync(path.join(dir, 'mine.png'), png(1280));
    fs.writeFileSync(path.join(dir, 'preview-dark.png'), png(640));
    fs.writeFileSync(path.join(dir, 'preview.png'), png(1280));
    expect(adoptOlderPicture(cwd, 't', path.join(dir, 'mine.png'))).toBe(false);
    expect(
      adoptOlderPicture(cwd, 't', path.join(dir, 'preview-dark.png')),
    ).toBe(false);
    expect(adoptOlderPicture(cwd, 't', path.join(dir, 'preview.png'))).toBe(
      true,
    );
    expect(editorWrote(cwd, 't', path.join(dir, 'preview.png'))).toBe(true);
    // A record exists now: nothing more is adopted.
    fs.writeFileSync(path.join(dir, 'sheet.png'), png(1280));
    expect(adoptOlderPicture(cwd, 't', path.join(dir, 'sheet.png'))).toBe(
      false,
    );
    for (const n of [
      'mine.png',
      'preview-dark.png',
      'preview.png',
      'sheet.png',
      't.pictures.json',
    ])
      fs.rmSync(path.join(dir, n), {force: true});
  });
});

describe('#11453: a recorded picture changed after', () => {
  it('is the person’s even with the stamp kept: never removed, never written over', async () => {
    const dir = path.join(cwd, 'themes/t');
    const file = path.join(dir, 'preview.png');
    fs.writeFileSync(file, withPngText(png(1280), EDITOR_STAMP, 't'));
    recordWritten(cwd, 't', [file]);
    expect(editorWrote(cwd, 't', file)).toBe(true);
    // Re-saved by another tool: one more text chunk, the stamp kept.
    fs.writeFileSync(
      file,
      withPngText(fs.readFileSync(file), 'Software', 'optipng'),
    );
    expect(pngTexts(fs.readFileSync(file))[EDITOR_STAMP]).toBe('t');
    expect(editorWrote(cwd, 't', file)).toBe(false);
    const kept = fs.readFileSync(file);
    await themeEditSet('t', 'corners', 'pill', {cwd});
    expect(fs.readFileSync(file).equals(kept)).toBe(true);
    const r = await pictures(
      /** @type {any} */ ({cwd}),
      [{html: path.join(dir, 'preview.html'), png: file}],
      ['light'],
    );
    expect(r.problem).toContain(
      'themes/t/preview.png is a file the editor did not write',
    );
    expect(fs.readFileSync(file).equals(kept)).toBe(true);
    fs.rmSync(file);
    fs.rmSync(path.join(dir, 't.pictures.json'), {force: true});
  }, 120_000);
});

describe('#11453: links in the theme folder', () => {
  it('a link to a file of the user’s is left alone; one in the editor’s files is named', async () => {
    const dir = path.join(cwd, 'themes/t');
    fs.writeFileSync(path.join(cwd, 'notes.md'), 'notes');
    fs.symlinkSync(path.join(cwd, 'notes.md'), path.join(dir, 'notes.md'));
    const r = await themeEditSet('t', 'corners', 'round', {cwd});
    expect(r.data.setting.value).toBe('round');
    fs.rmSync(path.join(dir, 'notes.md'));
    fs.symlinkSync('/nonexistent/p.png', path.join(dir, 'preview.png'));
    const err = await refusal(() =>
      themeEditSet('t', 'corners', 'square', {cwd}),
    );
    expect(err.message).toContain(
      'themes/t/preview.png is a link to /nonexistent/p.png',
    );
    expect(err.run).toEqual(['ls -l themes/t/preview.png']);
    fs.rmSync(path.join(dir, 'preview.png'));
  }, 120_000);
});

describe('#11453: a new refused for its name', () => {
  it('drops a vibrancy with no color to saturate, and says so', async () => {
    const err = await refusal(() =>
      themeEditNew('t', {cwd, settings: {vibrancy: '80', corners: 'pill'}}),
    );
    expect(err.run.join('\n')).not.toContain('--vibrancy');
    expect(err.run.join('\n')).toContain('--corners pill');
    expect(err.message).toContain('leaves out --vibrancy 80');
    const ok = await refusal(() =>
      themeEditNew('t', {cwd, settings: {accent: 'teal', vibrancy: '80'}}),
    );
    expect(ok.run.join('\n')).toContain('--vibrancy 80');
  }, 120_000);
});
