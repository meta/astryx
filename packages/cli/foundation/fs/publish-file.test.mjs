// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {publishNewFile} from './publish-file.mjs';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-publish-file-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('publishNewFile', () => {
  it('publishes a new file from a temporary', () => {
    const tmp = path.join(tmpDir, '.tmp-src');
    const dest = path.join(tmpDir, 'output.txt');
    fs.writeFileSync(tmp, 'hello');
    publishNewFile(tmp, dest);
    expect(fs.readFileSync(dest, 'utf-8')).toBe('hello');
  });

  it('preserves content fidelity for binary data', () => {
    const tmp = path.join(tmpDir, '.tmp-bin');
    const dest = path.join(tmpDir, 'output.bin');
    const buf = Buffer.from([0x00, 0xff, 0x80, 0x01, 0xfe]);
    fs.writeFileSync(tmp, buf);
    publishNewFile(tmp, dest);
    expect(fs.readFileSync(dest).equals(buf)).toBe(true);
  });

  it('does not remove the temporary file', () => {
    const tmp = path.join(tmpDir, '.tmp-keep');
    const dest = path.join(tmpDir, 'output.txt');
    fs.writeFileSync(tmp, 'data');
    publishNewFile(tmp, dest);
    expect(fs.existsSync(tmp)).toBe(true);
  });

  it('throws EEXIST when the destination already exists', () => {
    const tmp = path.join(tmpDir, '.tmp-src');
    const dest = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(tmp, 'new');
    fs.writeFileSync(dest, 'old');
    expect(() => publishNewFile(tmp, dest)).toThrow(
      expect.objectContaining({code: 'EEXIST'}),
    );
    expect(fs.readFileSync(dest, 'utf-8')).toBe('old');
  });

  it('protects existing content on collision', () => {
    const tmp = path.join(tmpDir, '.tmp-src');
    const dest = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(tmp, 'attacker');
    fs.writeFileSync(dest, 'victim');
    expect(() => publishNewFile(tmp, dest)).toThrow();
    expect(fs.readFileSync(dest, 'utf-8')).toBe('victim');
  });

  it('allows exactly one of two creators to publish', () => {
    const tmp1 = path.join(tmpDir, '.tmp-a');
    const tmp2 = path.join(tmpDir, '.tmp-b');
    const dest = path.join(tmpDir, 'contested.txt');
    fs.writeFileSync(tmp1, 'creator-a');
    fs.writeFileSync(tmp2, 'creator-b');

    publishNewFile(tmp1, dest);
    expect(() => publishNewFile(tmp2, dest)).toThrow(
      expect.objectContaining({code: 'EEXIST'}),
    );
    expect(fs.readFileSync(dest, 'utf-8')).toBe('creator-a');
  });

  it('re-throws ENOENT when the temporary does not exist', () => {
    const tmp = path.join(tmpDir, '.tmp-missing');
    const dest = path.join(tmpDir, 'output.txt');
    expect(() => publishNewFile(tmp, dest)).toThrow(
      expect.objectContaining({code: 'ENOENT'}),
    );
  });

  it('does not follow a symlink destination', () => {
    const tmp = path.join(tmpDir, '.tmp-src');
    const real = path.join(tmpDir, 'real.txt');
    const sym = path.join(tmpDir, 'sym.txt');
    fs.writeFileSync(tmp, 'data');
    fs.writeFileSync(real, 'original');
    fs.symlinkSync(real, sym);
    expect(() => publishNewFile(tmp, sym)).toThrow();
    expect(fs.readFileSync(real, 'utf-8')).toBe('original');
  });

  it('publishes a readable file', () => {
    const tmp = path.join(tmpDir, '.tmp-src');
    const dest = path.join(tmpDir, 'readable.txt');
    fs.writeFileSync(tmp, 'check-perms');
    publishNewFile(tmp, dest);
    const stat = fs.statSync(dest);
    expect(stat.mode & 0o444).toBeGreaterThan(0);
  });

  const hasWritableVarTmp = (() => {
    try {
      return os.platform() === 'linux' && fs.existsSync('/var/tmp');
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasWritableVarTmp)(
    'falls back to COPYFILE_EXCL when a cross-device link returns EXDEV',
    () => {
      const source = path.join(tmpDir, '.cross-src');
      fs.writeFileSync(source, 'cross-device-content');

      let otherDir;
      try {
        otherDir = fs.mkdtempSync('/var/tmp/astryx-xdev-');
      } catch {
        return;
      }
      try {
        const destination = path.join(otherDir, 'output.txt');
        publishNewFile(source, destination);
        expect(fs.readFileSync(destination, 'utf-8')).toBe(
          'cross-device-content',
        );
      } finally {
        fs.rmSync(otherDir, {recursive: true, force: true});
      }
    },
  );
});
