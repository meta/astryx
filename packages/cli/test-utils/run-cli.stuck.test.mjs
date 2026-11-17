// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A runCli run that outlives its test. The test still fails by its own
 * timeout, and the next test gets the process back. What the run does when it
 * wakes changes nothing: its exit, chdir and exit code are ignored, and its
 * writes reach no later run.
 */

import {afterAll, describe, expect, it, onTestFinished, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const late = vi.hoisted(() => {
  /** A promise and the function that settles it. */
  const signal = () => {
    /** @type {() => void} */
    let mark = () => {};
    const promise = new Promise(resolve => {
      mark = () => resolve(undefined);
    });
    return {promise, mark: () => mark()};
  };
  return {
    laterRunStarted: signal(),
    woken: signal(),
    laterRunDone: signal(),
    exitCodeSet: signal(),
  };
});

/**
 * A program that runCli can drive, which builds at once, so a short test
 * timeout measures the run alone.
 * @param {() => Promise<unknown>} parseAsync
 */
function fakeProgram(parseAsync) {
  return {exitOverride() {}, parseAsync};
}

vi.mock('../clients/cli/index.mjs', async importOriginal => {
  /** @type {typeof import('../clients/cli/index.mjs')} */
  const original = await importOriginal();
  return {
    ...original,
    /** @param {Parameters<typeof original.createProgram>[0]} options */
    createProgram: async options => {
      const command = options?.argv?.[0];
      if (command === 'stuck') {
        // Settles never. It wakes once a later run has started.
        return fakeProgram(async () => {
          const held = process.cwd();
          await late.laterRunStarted.promise;
          process.exit(7);
          process.chdir(held);
          console.log('from the released run');
          late.woken.mark();
          // Between runs, the released run sets an exit code too.
          await late.laterRunDone.promise;
          process.exitCode = 3;
          late.exitCodeSet.mark();
          return new Promise(() => {});
        });
      }
      if (command === 'later') {
        return fakeProgram(async () => {
          late.laterRunStarted.mark();
          await late.woken.promise;
          console.log('from the later run');
        });
      }
      return original.createProgram(options);
    },
  };
});

const {REPO_ROOT} = await import('./repo-root.mjs');
const {ignoredCallsOfReleasedRuns, runCli} = await import('./run-cli.mjs');

const dir = fs.mkdtempSync(path.join(REPO_ROOT, '.astryx-run-cli-stuck-'));

/** The stuck run's test timeout, and so how long its release waits. */
const TEST_TIMEOUT_MS = 500;

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

describe('runCli', () => {
  /** @type {{state?: string, error: string, cwd: string} | null} */
  let atTestEnd = null;

  it.fails(
    'a test whose run never settles fails by its own timeout',
    async () => {
      const pending = runCli(['stuck'], dir);
      // Registered after runCli's own hook, so it runs before the release.
      onTestFinished(({task}) => {
        atTestEnd = {
          state: task.result?.state,
          error: String(task.result?.errors?.[0]?.message),
          cwd: process.cwd(),
        };
      });
      await pending;
    },
    TEST_TIMEOUT_MS,
  );

  it('the next test runs, and the released run changes nothing when it wakes', async () => {
    expect(atTestEnd).toMatchObject({
      state: 'fail',
      cwd: fs.realpathSync(dir),
    });
    expect(atTestEnd?.error).toMatch(`timed out in ${TEST_TIMEOUT_MS}ms`);
    expect(process.cwd()).toBe(REPO_ROOT);

    const later = await runCli(['later']);

    expect(later).toMatchObject({
      status: 0,
      stdout: 'from the later run\n',
      stderr: '',
    });
    late.laterRunDone.mark();
    await late.exitCodeSet.promise;
    const version = await runCli(['--version']);
    expect(version.status).toBe(0);
    expect(process.exitCode).toBe(0);
    expect(ignoredCallsOfReleasedRuns()).toEqual([
      {call: 'exit', args: [7]},
      {call: 'chdir', args: [fs.realpathSync(dir)]},
      {call: 'write', args: ['from the released run\n']},
      {call: 'exitCode', args: [3]},
    ]);
    expect(process.cwd()).toBe(REPO_ROOT);
  });
});
