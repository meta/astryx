// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {themeEject} from './eject.mjs';
import {listThemes} from '../_adapter.mjs';

let tmpDir;
let outsideDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-themeeject-staging-'));
  outsideDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-themeeject-outside-'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
  fs.rmSync(outsideDir, {recursive: true, force: true});
});

/**
 * Where `theme eject` writes the first file of `slug`.
 * @param {string} slug
 */
function firstDestination(slug) {
  const theme = listThemes().find(entry => entry.slug === slug);
  if (!theme) throw new Error(`missing bundled theme ${slug}`);
  const dest = path.join(tmpDir, 'src', 'themes', slug, theme.files[0]);
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  return dest;
}

// Staging names are unpredictable and created exclusively, so an entry planted
// at a predictable name beside the destination is never written through.
describe('themeEject staging writes stay inside the project', () => {
  it('never writes through a link planted at a predictable staging name', async () => {
    const victim = path.join(outsideDir, 'victim.txt');
    fs.writeFileSync(victim, 'outside\n');
    const dest = firstDestination('stone');
    fs.symlinkSync(victim, `${dest}.${process.pid}.tmp`);

    await themeEject('stone', {cwd: tmpDir});

    expect(fs.readFileSync(victim, 'utf-8')).toBe('outside\n');
    expect(fs.lstatSync(dest).isFile()).toBe(true);
  });

  it('never creates a file through a dangling link at a predictable staging name', async () => {
    const victim = path.join(outsideDir, 'created.txt');
    fs.symlinkSync(victim, `${firstDestination('stone')}.${process.pid}.tmp`);

    await themeEject('stone', {cwd: tmpDir});

    expect(fs.existsSync(victim)).toBe(false);
  });

  it('refuses to replace a destination that links outside the project', async () => {
    const victim = path.join(outsideDir, 'victim.txt');
    fs.writeFileSync(victim, 'outside\n');
    const dest = firstDestination('stone');
    fs.symlinkSync(victim, dest);

    await expect(
      themeEject('stone', {cwd: tmpDir, overwrite: true}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
    expect(fs.readFileSync(victim, 'utf-8')).toBe('outside\n');
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(true);
  });

  it('never creates a file through a dangling destination link', async () => {
    const victim = path.join(outsideDir, 'created.txt');
    fs.symlinkSync(victim, firstDestination('stone'));

    await expect(themeEject('stone', {cwd: tmpDir})).rejects.toMatchObject({
      code: 'ERR_PATH_TRAVERSAL',
    });
    expect(fs.existsSync(victim)).toBe(false);
  });
});
