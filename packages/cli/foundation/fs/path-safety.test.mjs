// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  assertWithin,
  sanitizeName,
  isFilePathArg,
  PathSafetyError,
} from './path-safety.mjs';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-path-safety-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * The code a guard rejected with, or 'accepted'.
 * @param {() => unknown} fn
 */
function rejectionCode(fn) {
  try {
    fn();
  } catch (err) {
    return err instanceof PathSafetyError ? err.code : err;
  }
  return 'accepted';
}

describe('assertWithin', () => {
  it('accepts a relative path that stays inside root', () => {
    const result = assertWithin('subdir/file.txt', tmpDir);
    expect(result).toBe(path.join(tmpDir, 'subdir', 'file.txt'));
  });

  it('accepts the root itself', () => {
    expect(assertWithin('.', tmpDir)).toBe(path.resolve(tmpDir));
  });

  it('rejects ../ traversal', () => {
    expect(() => assertWithin('../escaped', tmpDir)).toThrow(PathSafetyError);
    expect(() => assertWithin('../escaped', tmpDir)).toThrow(/traversal|outside/i);
  });

  it('rejects deep ../../ traversal', () => {
    expect(() => assertWithin('a/b/../../../c', tmpDir)).toThrow(PathSafetyError);
  });

  it('reports an escape with the registered ERR_PATH_TRAVERSAL code', () => {
    // An uncaught guard error reaches the JSON envelope with this code as-is.
    expect(rejectionCode(() => assertWithin('../escaped', tmpDir))).toBe('ERR_PATH_TRAVERSAL');
    expect(
      rejectionCode(() => assertWithin('/etc/passwd', tmpDir, {allowAbsolute: true})),
    ).toBe('ERR_PATH_TRAVERSAL');
  });

  it('rejects absolute paths by default', () => {
    expect(() => assertWithin('/tmp/elsewhere', tmpDir)).toThrow(/absolute paths are not allowed/i);
  });

  it('accepts absolute paths inside root when allowAbsolute', () => {
    const inside = path.join(tmpDir, 'x.txt');
    expect(assertWithin(inside, tmpDir, {allowAbsolute: true})).toBe(inside);
  });

  it('rejects absolute paths outside root even when allowAbsolute', () => {
    expect(() =>
      assertWithin('/etc/passwd', tmpDir, {allowAbsolute: true}),
    ).toThrow(PathSafetyError);
  });

  it('does not match sibling-prefix paths', () => {
    // /tmp/foo should not be accepted as inside /tmp/foobar
    const root = path.join(tmpDir, 'foo');
    fs.mkdirSync(root);
    expect(() => assertWithin('../foobar/x', root)).toThrow(PathSafetyError);
  });

  it('rejects empty / non-string input', () => {
    expect(() => assertWithin('', tmpDir)).toThrow(/non-empty/i);
    expect(() => assertWithin(null, tmpDir)).toThrow();
  });
});

describe('sanitizeName', () => {
  it('accepts simple names', () => {
    expect(sanitizeName('button')).toBe('button');
    expect(sanitizeName('Default-Theme_2')).toBe('Default-Theme_2');
    expect(sanitizeName('theme.v1')).toBe('theme.v1');
  });

  it('rejects names with /', () => {
    expect(() => sanitizeName('foo/bar')).toThrow(PathSafetyError);
    expect(() => sanitizeName('foo/bar')).toThrow(/path separator/i);
  });

  it('rejects names with \\', () => {
    expect(() => sanitizeName('foo\\bar')).toThrow(PathSafetyError);
  });

  it('rejects ..', () => {
    expect(() => sanitizeName('..')).toThrow(PathSafetyError);
    expect(() => sanitizeName('../escaped')).toThrow(PathSafetyError);
  });

  it('rejects . and leading dots that look traversal-y', () => {
    expect(() => sanitizeName('.')).toThrow(PathSafetyError);
  });

  it('rejects dotfile names (.env, .htaccess) that could create hidden files', () => {
    expect(() => sanitizeName('.env')).toThrow(PathSafetyError);
    expect(() => sanitizeName('.htaccess')).toThrow(PathSafetyError);
    expect(() => sanitizeName('.bashrc')).toThrow(PathSafetyError);
    expect(() => sanitizeName('.gitignore')).toThrow(PathSafetyError);
  });

  it('rejects NUL bytes', () => {
    expect(() => sanitizeName('foo\0bar')).toThrow(PathSafetyError);
  });

  it('rejects empty/non-string', () => {
    expect(() => sanitizeName('')).toThrow(PathSafetyError);
    expect(() => sanitizeName(null)).toThrow(PathSafetyError);
  });

  it('rejects characters outside the allow-list', () => {
    expect(() => sanitizeName('foo bar')).toThrow(PathSafetyError);
    expect(() => sanitizeName('foo$bar')).toThrow(PathSafetyError);
  });
});

describe('isFilePathArg', () => {
  it('returns true for known source extensions', () => {
    expect(isFilePathArg('foo.tsx')).toBe(true);
    expect(isFilePathArg('./foo.tsx')).toBe(true);
    expect(isFilePathArg('./src/page.jsx')).toBe(true);
    expect(isFilePathArg('out.js')).toBe(true);
    expect(isFilePathArg('out.mjs')).toBe(true);
    expect(isFilePathArg('out.css')).toBe(true);
  });

  it('returns false for plain directory names', () => {
    expect(isFilePathArg('out')).toBe(false);
    expect(isFilePathArg('./components/astryx')).toBe(false);
    expect(isFilePathArg('src/pages')).toBe(false);
  });

  it('returns false for trailing slash even with extension-like name', () => {
    expect(isFilePathArg('foo.tsx/')).toBe(false);
  });

  it('returns false for unknown extensions', () => {
    expect(isFilePathArg('archive.zip')).toBe(false);
  });

  it('returns false for empty/invalid', () => {
    expect(isFilePathArg('')).toBe(false);
    expect(isFilePathArg(null)).toBe(false);
  });
});

describe('assertWithin — symlink escape (realpath guard)', () => {
  let root;
  let outside;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-root-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-out-'));
  });
  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
    fs.rmSync(outside, {recursive: true, force: true});
  });

  it('rejects a path that traverses a symlink pointing outside root', () => {
    fs.symlinkSync(outside, path.join(root, 'link'));
    // path.resolve is lexical and would pass this; the realpath check must catch it.
    expect(() => assertWithin('link/evil.txt', root)).toThrow(PathSafetyError);
    expect(() => assertWithin('link/evil.txt', root)).toThrow(/outside|symlink|traversal/i);
    expect(rejectionCode(() => assertWithin('link/evil.txt', root))).toBe('ERR_PATH_TRAVERSAL');
  });

  it('still accepts a legit non-existent nested path inside root', () => {
    expect(assertWithin('a/b/c.txt', root)).toBe(path.join(root, 'a', 'b', 'c.txt'));
  });

  it('rejects a NUL byte in the path', () => {
    expect(() => assertWithin('a\u0000b', root)).toThrow(PathSafetyError);
  });

  it('rejects a dangling symlink whose target is outside root', () => {
    // A write through the link would create the missing target outside root.
    fs.symlinkSync(path.join(outside, 'created.txt'), path.join(root, 'leaf'));
    expect(rejectionCode(() => assertWithin('leaf', root))).toBe('ERR_PATH_TRAVERSAL');
  });

  it('rejects a path through a dangling directory symlink that points outside root', () => {
    fs.symlinkSync(path.join(outside, 'missing-dir'), path.join(root, 'dir'));
    expect(rejectionCode(() => assertWithin('dir/evil.txt', root))).toBe('ERR_PATH_TRAVERSAL');
  });

  it('follows a chain of links that ends in a dangling target outside root', () => {
    fs.symlinkSync(path.join(outside, 'missing.txt'), path.join(root, 'second'));
    fs.symlinkSync('second', path.join(root, 'first'));
    expect(rejectionCode(() => assertWithin('first', root))).toBe('ERR_PATH_TRAVERSAL');
  });

  it('accepts a dangling symlink whose target stays inside root', () => {
    fs.symlinkSync(path.join('sub', 'new.txt'), path.join(root, 'leaf'));
    expect(assertWithin('leaf', root)).toBe(path.join(root, 'leaf'));
  });

  it('terminates on a symlink loop', () => {
    fs.symlinkSync('loop', path.join(root, 'loop'));
    const result = rejectionCode(() => assertWithin('loop', root));
    expect(['accepted', 'ERR_PATH_TRAVERSAL']).toContain(result);
  });
});
