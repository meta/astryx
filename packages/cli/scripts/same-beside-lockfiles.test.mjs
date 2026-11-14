// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  assertSameBesideLockfiles,
  inFreshFolder,
  LOCKFILES,
} from './same-beside-lockfiles.mjs';

describe('the publish guard', () => {
  it('passes an answer that is the same beside every lockfile', () => {
    expect(() =>
      assertSameBesideLockfiles('the answer', 'same', () => 'same'),
    ).not.toThrow();
  });

  it('names the lockfile beside which an answer differs', () => {
    const answer = (/** @type {string} */ dir) =>
      fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : 'other';
    expect(() =>
      assertSameBesideLockfiles('the answer', 'other', answer),
    ).toThrow('the answer differs beside yarn.lock');
  });

  it('runs each probe in a fresh folder it then removes', () => {
    /** @type {string[]} */
    const seen = [];
    assertSameBesideLockfiles('the answer', 1, dir => {
      seen.push(dir);
      expect(fs.readdirSync(dir).sort()).toHaveLength(2);
      return 1;
    });
    expect(seen).toHaveLength(LOCKFILES.length);
    expect(seen.some(dir => fs.existsSync(dir))).toBe(false);
    expect(inFreshFolder(dir => fs.readdirSync(dir))).toEqual([]);
  });
});
