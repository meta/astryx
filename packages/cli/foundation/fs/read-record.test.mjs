// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for read-record: which paths an operation read, and whether
 * any changed since, including a change made while the operation ran.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  recordContentRead,
  recordReads,
  reusedWhileUnchanged,
  unchangedSince,
} from './read-record.mjs';

function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-read-record-'));
  const file = path.join(dir, 'doc.txt');
  fs.writeFileSync(file, 'one');
  return {dir, file};
}

describe('recordReads', () => {
  it('records a read file and a listed folder, and sees them unchanged', () => {
    const {dir, file} = scratch();
    /** @type {Map<string, string>} */
    const seen = new Map();
    recordReads(seen, () => {
      fs.readFileSync(file, 'utf8');
      fs.readdirSync(dir);
    });
    expect([...seen.keys()]).toEqual(expect.arrayContaining([file, dir]));
    expect(unchangedSince(seen)).toBe(true);
  });

  it('sees an edit made after the operation', () => {
    const {file} = scratch();
    /** @type {Map<string, string>} */
    const seen = new Map();
    recordReads(seen, () => fs.readFileSync(file, 'utf8'));
    const later = new Date(Date.now() + 5_000);
    fs.writeFileSync(file, 'two, longer');
    fs.utimesSync(file, later, later);
    expect(unchangedSince(seen)).toBe(false);
  });

  it('sees an edit made while the operation ran, after the file was read', () => {
    const {file} = scratch();
    /** @type {Map<string, string>} */
    const seen = new Map();
    recordReads(seen, () => {
      fs.readFileSync(file, 'utf8');
      const later = new Date(Date.now() + 5_000);
      fs.writeFileSync(file, 'edited mid-run');
      fs.utimesSync(file, later, later);
    });
    expect(unchangedSince(seen)).toBe(false);
  });

  it('sees a file added to a folder it probed', () => {
    const {dir} = scratch();
    /** @type {Map<string, string>} */
    const seen = new Map();
    recordReads(seen, () => fs.existsSync(path.join(dir, 'missing.txt')));
    const later = new Date(Date.now() + 5_000);
    fs.writeFileSync(path.join(dir, 'missing.txt'), 'now here');
    fs.utimesSync(dir, later, later);
    expect(unchangedSince(seen)).toBe(false);
  });

  it('records nothing outside an operation', () => {
    const {file} = scratch();
    /** @type {Map<string, string>} */
    const seen = new Map();
    recordReads(seen, () => {});
    fs.readFileSync(file, 'utf8');
    recordContentRead(file);
    expect(seen.size).toBe(0);
  });

  it('records a file read without fs, such as an imported doc module, and sees it edited', () => {
    const {file} = scratch();
    /** @type {Map<string, string>} */
    const seen = new Map();
    recordReads(seen, () => recordContentRead(file));
    expect([...seen.keys()]).toEqual([file]);
    expect(unchangedSince(seen)).toBe(true);
    fs.writeFileSync(file, 'two, longer');
    expect(unchangedSince(seen)).toBe(false);
  });

  it('records a read in an operation inside another into both', async () => {
    const {file} = scratch();
    /** @type {Map<string, string>} */
    const outer = new Map();
    /** @type {Map<string, string>} */
    const inner = new Map();
    await recordReads(outer, async () => {
      await recordReads(inner, async () => fs.readFileSync(file, 'utf8'));
    });
    expect([...inner.keys()]).toEqual([file]);
    expect([...outer.keys()]).toEqual([file]);
  });

  it('sees a rewrite that keeps the size and modification time, as an npm reinstall does', () => {
    const {file} = scratch();
    const stamped = new Date('1985-10-26T08:15:00Z');
    fs.utimesSync(file, stamped, stamped);
    /** @type {Map<string, string>} */
    const seen = new Map();
    recordReads(seen, () => fs.readFileSync(file, 'utf8'));
    // Same size, and the same modification time npm stamps on every file.
    const replacement = `${file}.new`;
    fs.writeFileSync(replacement, 'two');
    fs.utimesSync(replacement, stamped, stamped);
    fs.renameSync(replacement, file);
    expect(unchangedSince(seen)).toBe(false);
  });
});

describe('reusedWhileUnchanged', () => {
  it('keeps a loaded value while what it read is unchanged, and loads again after an edit', async () => {
    const {file} = scratch();
    let loads = 0;
    const get = reusedWhileUnchanged(async () => {
      loads += 1;
      return fs.readFileSync(file, 'utf8');
    });
    expect(await get()).toBe('one');
    expect(await get()).toBe('one');
    expect(loads).toBe(1);
    fs.writeFileSync(file, 'two, longer');
    expect(await get()).toBe('two, longer');
    expect(loads).toBe(2);
    expect(await get({fresh: true})).toBe('two, longer');
    expect(loads).toBe(3);
  });

  it('counts what a kept value read as read by the operation that asks for it', async () => {
    const {file} = scratch();
    const get = reusedWhileUnchanged(async () => fs.readFileSync(file, 'utf8'));
    await get();
    /** @type {Map<string, string>} */
    const seen = new Map();
    await recordReads(seen, () => get());
    expect([...seen.keys()]).toEqual([file]);
    fs.writeFileSync(file, 'two, longer');
    expect(unchangedSince(seen)).toBe(false);
  });

  it('tries a failed load again', async () => {
    let calls = 0;
    const get = reusedWhileUnchanged(async () => {
      calls += 1;
      if (calls === 1) throw new Error('first try');
      return 'second try';
    });
    await expect(get()).rejects.toThrow('first try');
    expect(await get()).toBe('second try');
  });
});
