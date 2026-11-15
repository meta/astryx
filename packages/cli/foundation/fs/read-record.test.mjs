// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for read-record: which paths an operation read, and whether
 * any changed since, including a change made while the operation ran.
 */

import {afterAll, beforeAll, describe, it, expect, vi} from 'vitest';
import {createRequire} from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  keepState,
  recordContentRead,
  recordReads,
  reusedWhileUnchanged,
  unchangedSince,
} from './read-record.mjs';

/**
 * Every temporary folder these tests make lives here, removed once they
 * finish. It is made in beforeAll, not when the module loads: Vitest skips
 * both hooks when a run filters out every test here.
 */
let TEMP_ROOT = '';
beforeAll(() => {
  TEMP_ROOT = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-read-record-test-'),
  );
});
afterAll(() => {
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

function scratch() {
  const dir = fs.mkdtempSync(path.join(TEMP_ROOT, 'astryx-read-record-'));
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

describe('an exact run', () => {
  /**
   * What an exact run records while `fn` runs.
   * @param {() => void} fn
   */
  function exact(fn) {
    /** @type {Map<string, string>} */
    const seen = new Map();
    recordReads(seen, fn, {exact: true});
    return seen;
  }

  /**
   * Rewrite `file` with `content` of the same size, keeping its modification
   * time, as an npm reinstall can.
   * @param {string} file
   * @param {string} content
   */
  function rewriteKeepingTime(file, content) {
    const {atime, mtime} = fs.statSync(file);
    fs.rmSync(file);
    fs.writeFileSync(file, content);
    fs.utimesSync(file, atime, mtime);
  }

  it('records an existence check by whether the path is there: an edit keeps it, a removal does not', () => {
    const {file} = scratch();
    const seen = exact(() => fs.existsSync(file));
    fs.writeFileSync(file, 'two, longer');
    expect(unchangedSince(seen)).toBe(true);
    fs.rmSync(file);
    expect(unchangedSince(seen)).toBe(false);
  });

  it('sees a path an existence check found absent appear', () => {
    const {dir} = scratch();
    const later = path.join(dir, 'later.txt');
    const seen = exact(() => fs.existsSync(later));
    expect(unchangedSince(seen)).toBe(true);
    fs.writeFileSync(later, 'here');
    expect(unchangedSince(seen)).toBe(false);
  });

  it('checks a path it read, statted or opened after checking for it by its stamp', () => {
    for (const use of [
      (/** @type {string} */ file) => fs.readFileSync(file, 'utf8'),
      (/** @type {string} */ file) => fs.statSync(file),
      (/** @type {string} */ file) => fs.closeSync(fs.openSync(file, 'r')),
    ]) {
      const {file} = scratch();
      const seen = exact(() => {
        fs.existsSync(file);
        use(file);
      });
      fs.writeFileSync(file, 'two, longer');
      expect(unchangedSince(seen)).toBe(false);
    }
  });

  it('keeps the stamp of a path it read before checking for it', () => {
    const {file} = scratch();
    const seen = exact(() => {
      fs.readFileSync(file, 'utf8');
      fs.existsSync(file);
    });
    fs.writeFileSync(file, 'two, longer');
    expect(unchangedSince(seen)).toBe(false);
  });

  it('sees a same-size rewrite that keeps the time of a file it read after checking for it', () => {
    const {file} = scratch();
    const seen = exact(() => {
      fs.existsSync(file);
      fs.readFileSync(file, 'utf8');
    });
    rewriteKeepingTime(file, 'owt');
    expect(unchangedSince(seen)).toBe(false);
  });

  it('records a real-path lookup by the path it resolves to', () => {
    const {dir, file} = scratch();
    const other = path.join(dir, 'other.txt');
    fs.writeFileSync(other, 'other');
    const link = path.join(dir, 'link.txt');
    fs.symlinkSync(file, link);
    const seen = exact(() => fs.realpathSync(link));
    fs.writeFileSync(file, 'two, longer');
    expect(unchangedSince(seen)).toBe(true);
    fs.rmSync(link);
    fs.symlinkSync(other, link);
    expect(unchangedSince(seen)).toBe(false);
  });

  it('sees the target of a real-path lookup removed', () => {
    const {dir, file} = scratch();
    const link = path.join(dir, 'link.txt');
    fs.symlinkSync(file, link);
    const seen = exact(() => fs.realpathSync(link));
    fs.rmSync(file);
    expect(unchangedSince(seen)).toBe(false);
  });

  it('records a real-path lookup that the native lookup refuses by the lookup the program made, and keeps it', async () => {
    const {dir, file} = scratch();
    const link = path.join(dir, 'link.txt');
    fs.symlinkSync(file, link);
    const nodeFs = createRequire(import.meta.url)('node:fs');
    const native = nodeFs.realpathSync.native;
    const refused = Object.assign(new Error('refused'), {code: 'EPERM'});
    nodeFs.realpathSync.native = (/** @type {string} */ at) => {
      if (at === link) throw refused;
      return native(at);
    };
    vi.resetModules();
    try {
      const fresh = await import('./read-record.mjs');
      /** @type {Map<string, string>} */
      const seen = new Map();
      fresh.recordReads(seen, () => fs.realpathSync(link), {exact: true});
      expect([...seen.values()]).toContain(fs.realpathSync(link));
      expect(fresh.unchangedSince(seen)).toBe(true);
      fs.rmSync(link);
      fs.symlinkSync(path.join(dir, 'other.txt'), link);
      fs.writeFileSync(path.join(dir, 'other.txt'), 'other');
      expect(fresh.unchangedSince(seen)).toBe(false);
    } finally {
      nodeFs.realpathSync.native = native;
      vi.resetModules();
    }
  });

  it('records a missing real path as absent, by either lookup', () => {
    const {dir} = scratch();
    const missing = path.join(dir, 'missing', 'file.txt');
    const seen = exact(() => {
      try {
        fs.realpathSync(missing);
      } catch {
        // absent
      }
    });
    expect([...seen.values()]).toEqual(['-']);
    expect(unchangedSince(seen)).toBe(true);
    fs.mkdirSync(path.dirname(missing));
    fs.writeFileSync(missing, 'here');
    expect(unchangedSince(seen)).toBe(false);
  });

  it('checks a path both looked up and read by both', () => {
    const {file} = scratch();
    const seen = exact(() => {
      fs.realpathSync(file);
      fs.readFileSync(file, 'utf8');
    });
    expect(unchangedSince(seen)).toBe(true);
    fs.writeFileSync(file, 'two, longer');
    expect(unchangedSince(seen)).toBe(false);
  });

  it('keeps a stamp read elsewhere over an existence check, and never the other way', () => {
    const {file} = scratch();
    const stamped = exact(() => fs.readFileSync(file, 'utf8'));
    const stamp = /** @type {string} */ (stamped.get(file));
    const checked = exact(() => fs.existsSync(file));
    const presence = /** @type {string} */ (checked.get(file));
    expect(presence).not.toBe(stamp);
    /** @type {Map<string, string>} */
    const first = new Map();
    keepState(first, file, presence);
    keepState(first, file, stamp);
    expect(first.get(file)).toBe(stamp);
    /** @type {Map<string, string>} */
    const second = new Map();
    keepState(second, file, stamp);
    keepState(second, file, presence);
    expect(second.get(file)).toBe(stamp);
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

  it('shares a load that is still running, unless what it read has changed since', async () => {
    const {file} = scratch();
    let loads = 0;
    /** @type {(() => void)[]} */
    const finish = [];
    const get = reusedWhileUnchanged(async () => {
      loads += 1;
      const text = fs.readFileSync(file, 'utf8');
      await new Promise(resolve => finish.push(() => resolve(undefined)));
      return text;
    });
    const running = get();
    const joined = get();
    expect(loads).toBe(1);
    // An edit to a file the running load already read: a later call loads
    // again instead of sharing the pre-edit value.
    fs.writeFileSync(file, 'two, longer');
    const afterEdit = get();
    expect(loads).toBe(2);
    for (const done of finish) done();
    expect(await running).toBe('one');
    expect(await joined).toBe('one');
    expect(await afterEdit).toBe('two, longer');
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
