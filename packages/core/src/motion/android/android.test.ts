// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file android.test.ts
 * @input The Android constants table's files and values, the motion roles
 * @output Tests that every leaf carries a source, the values, and that the
 *   table registers no motion role
 * @position Testing for /packages/core/src/motion/android
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {motionRole} from '../roles';
import {keyboard} from '.';

const SOURCE_KINDS =
  /^@source (aosp frameworks\/|measured: .*Android \d|GUESS — )/;
const TABLE_FILES = fs
  .readdirSync(__dirname)
  .filter(
    f => f.endsWith('.ts') && f !== 'index.ts' && !f.endsWith('.test.ts'),
  );

describe('the Android constants table', () => {
  it('gives every leaf a source', () => {
    for (const file of TABLE_FILES) {
      const text = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
      const body = text.slice(text.indexOf('export const'));
      const leaves = [...body.matchAll(/\/\*\*([\s\S]*?)\*\/\s*\n\s*(\w+):/g)];
      expect(leaves.length, file).toBeGreaterThan(0);
      for (const [, doc, key] of leaves) {
        const sources = doc
          .split('\n')
          .map(line => line.replace(/^\s*\*\s?/, ''))
          .filter(line => line.startsWith('@source'));
        expect(sources.length, `${file} ${key}`).toBeGreaterThan(0);
        for (const source of sources) {
          expect(source, `${file} ${key}`).toMatch(SOURCE_KINDS);
        }
      }
    }
  });

  it('slides the keyboard up and down on Gboard’s measured curves', () => {
    expect(keyboard.showCurve).toEqual([0.1, 0, 0, 1]);
    expect(keyboard.showMs).toBe(267);
    expect(keyboard.hideCurve).toEqual([0.3, 0.1, 0.2, 0.9]);
    expect(keyboard.hideMs).toBe(167);
    expect(keyboard.showReportLagMs).toBeGreaterThan(0);
  });

  it('is the keyboard’s own motion, no motion role', () => {
    for (const key of Object.keys(keyboard)) {
      expect(motionRole(`androidKeyboard.${key}`), key).toBeUndefined();
    }
  });
});
