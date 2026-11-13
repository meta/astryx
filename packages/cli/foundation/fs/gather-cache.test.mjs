// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import nodeModule, {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {persistedGather, recordedRun, recordRun} from './gather-cache.mjs';
import {withoutRecording} from './read-record.mjs';

const identity = {
  encode: (/** @type {any} */ v) => v,
  decode: (/** @type {any} */ v) => v,
};

// A recorded run arms through module.registerHooks, which Node has from 22.15
// and 23.5. On an older Node the CLI supports (its oldest is 22.13), a recorded
// run only runs the gather, as the fallback case below shows.
const hasModuleHooks =
  typeof (/** @type {any} */ (nodeModule).registerHooks) === 'function';

describe.skipIf(!hasModuleHooks)(
  'what a recorded run keeps of the environment',
  () => {
    const name = `ASTRYX_GATHER_ENV_PATTERN_${process.pid}`;
    /**
     * Run `read` in a recorded run with `name` set, and say what was kept for
     * it: its value, whether it is set, and the whole list of names.
     * @param {(env: NodeJS.ProcessEnv) => unknown} read
     */
    async function keptFor(read) {
      process.env[name] = 'secret';
      try {
        return await recordRun(async () => {
          read(process.env);
          const env =
            /** @type {NonNullable<ReturnType<typeof recordedRun>>} */ (
              recordedRun()
            ).env;
          return {
            value: env.has(name),
            set: env.has(`\0set:${name}`),
            names: env.has('\0names'),
          };
        });
      } finally {
        delete process.env[name];
      }
    }

    it('keeps only the names for Object.keys and for..in', async () => {
      expect(await keptFor(env => Object.keys(env))).toEqual({
        value: false,
        set: true,
        names: true,
      });
      expect(
        await keptFor(env => {
          for (const _ in env);
        }),
      ).toMatchObject({value: false, names: true});
    });

    it('keeps only whether a variable is set for `in` and Object.hasOwn', async () => {
      expect(await keptFor(env => name in env)).toEqual({
        value: false,
        set: true,
        names: false,
      });
      expect(await keptFor(env => Object.hasOwn(env, name))).toEqual({
        value: false,
        set: true,
        names: false,
      });
    });

    it('keeps the value for every read that goes through [[Get]]', async () => {
      for (const read of [
        (/** @type {NodeJS.ProcessEnv} */ env) => env[name],
        (/** @type {NodeJS.ProcessEnv} */ env) => Object.entries(env),
        (/** @type {NodeJS.ProcessEnv} */ env) => Object.values(env),
        (/** @type {NodeJS.ProcessEnv} */ env) => ({...env}),
        (/** @type {NodeJS.ProcessEnv} */ env) => Object.assign({}, env),
        (/** @type {NodeJS.ProcessEnv} */ env) => JSON.stringify(env),
      ]) {
        expect(await keptFor(read)).toMatchObject({value: true});
      }
    });
  },
);

describe('a recorded run', () => {
  it.skipIf(!hasModuleHooks)(
    'gives every reader of process.env what the real one gives, then puts it back',
    async () => {
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
        const dir = fs.mkdtempSync(
          path.join(os.tmpdir(), 'gather-cache-hook-'),
        );
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
    },
  );

  it.skipIf(!hasModuleHooks)(
    'keeps recording after a gather nested inside another, until the outer one ends',
    async () => {
      const real = process.env;
      const name = `ASTRYX_GATHER_CACHE_NESTED_${process.pid}`;
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'gather-cache-nested-'),
      );
      const late = path.join(dir, 'late.cjs');
      fs.writeFileSync(late, 'module.exports = 1;\n');
      try {
        await recordRun(async () => {
          const run =
            /** @type {NonNullable<ReturnType<typeof recordedRun>>} */ (
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
    },
  );

  it.skipIf(hasModuleHooks)(
    'only runs the gather on a Node without module.registerHooks, and records nothing',
    async () => {
      const real = process.env;
      const result = await recordRun(async () => {
        expect(recordedRun()).toBeNull();
        expect(process.env).toBe(real);
        return 42;
      });
      expect(result).toBe(42);
      expect(recordedRun()).toBeNull();
    },
  );

  it.skipIf(!hasModuleHooks)(
    'notes the modules a gather loads while it is armed',
    async () => {
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
    },
  );
});
