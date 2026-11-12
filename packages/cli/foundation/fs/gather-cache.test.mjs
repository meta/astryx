// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {persistedGather, recordedRun, recordRun} from './gather-cache.mjs';
import {withoutRecording} from './read-record.mjs';

const identity = {
  encode: (/** @type {any} */ v) => v,
  decode: (/** @type {any} */ v) => v,
};

describe('a recorded run', () => {
  it('gives every reader of process.env what the real one gives, then puts it back', async () => {
    const real = process.env;
    const name = `ASTRYX_GATHER_CACHE_TEST_${process.pid}`;
    await recordRun(async () => {
      const env = process.env;
      expect(env).not.toBe(real);
      expect(Object.keys(env)).toEqual(Object.keys(real));
      expect(Object.entries(env)).toEqual(Object.entries(real));
      expect(JSON.stringify(env)).toBe(JSON.stringify(real));
      expect({...env}).toEqual({...real});
      /** @type {string[]} */
      const forIn = [];
      for (const key in env) forIn.push(key);
      expect(forIn).toEqual(Object.keys(real));
      expect('PATH' in env).toBe('PATH' in real);
      expect(Object.getOwnPropertyDescriptor(env, 'PATH')).toEqual(
        Object.getOwnPropertyDescriptor(real, 'PATH'),
      );
      expect(Object.hasOwn(env, 'PATH')).toBe(Object.hasOwn(real, 'PATH'));
      env[name] = '1';
      expect(real[name]).toBe('1');
      expect(env[name]).toBe('1');
      delete env[name];
      expect(name in real).toBe(false);
      // Kept as a digest of the value, never the value itself.
      expect(recordedRun()?.env.get('PATH')).toBe(
        real.PATH === undefined
          ? null
          : createHash('sha256').update(real.PATH).digest('hex').slice(0, 32),
      );

      await persistedGather(['test'], async () => 'value', identity);

      // After the gather: the real environment, and the module hook inert.
      expect(process.env).toBe(real);
      const run = /** @type {NonNullable<ReturnType<typeof recordedRun>>} */ (
        recordedRun()
      );
      const before = run.env.size;
      void process.env.HOME;
      expect(run.env.size).toBe(before);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gather-cache-hook-'));
      const late = path.join(dir, 'late.cjs');
      fs.writeFileSync(late, 'module.exports = 1;\n');
      try {
        // Outside fs recording, only the module hook could note it.
        withoutRecording(() => createRequire(import.meta.url)(late));
        expect(run.reads.has(late)).toBe(false);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });
    expect(process.env).toBe(real);
    expect(recordedRun()).toBe(null);
  });

  it('keeps recording after a gather nested inside another, until the outer one ends', async () => {
    const real = process.env;
    const name = `ASTRYX_GATHER_CACHE_NESTED_${process.pid}`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gather-cache-nested-'));
    const late = path.join(dir, 'late.cjs');
    fs.writeFileSync(late, 'module.exports = 1;\n');
    try {
      await recordRun(async () => {
        const run = /** @type {NonNullable<ReturnType<typeof recordedRun>>} */ (
          recordedRun()
        );
        await persistedGather(
          ['outer'],
          async () => {
            await persistedGather(['inner'], async () => 'inner', identity);
            // Still the outer gather: its env reads and module loads count.
            expect(process.env).not.toBe(real);
            void process.env[name];
            expect(run.env.has(name)).toBe(true);
            withoutRecording(() => createRequire(import.meta.url)(late));
            expect(run.reads.has(late)).toBe(true);
            return 'outer';
          },
          identity,
        );
        // The outer gather is done: the real environment again.
        expect(process.env).toBe(real);
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
    expect(process.env).toBe(real);
  });

  it('notes the modules a gather loads while it is armed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gather-cache-hook-'));
    // Loaded through Node's own loader (vitest serves its own imports), and
    // outside fs recording, so only the module hook can note it.
    const early = path.join(dir, 'early.cjs');
    fs.writeFileSync(early, 'module.exports = 1;\n');
    try {
      await recordRun(async () => {
        withoutRecording(() => createRequire(import.meta.url)(early));
        expect(recordedRun()?.reads.has(early)).toBe(true);
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
