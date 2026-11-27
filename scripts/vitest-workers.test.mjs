// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Vitest worker count on a machine (testWorkers): a command-line
 *   count, a CI runner, a watch and a command line it cannot read keep
 *   Vitest's own count; a single run on a shared many-core machine runs at
 *   most 8, and one worker per 2 GiB when memory is short.
 */

import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import config from '../vitest.config.ts';
import {MOST_WORKERS, testWorkers} from './vitest-workers.mjs';

const GiB = 1024 ** 3;

/** A shared machine: CI unset, no worker count on the command line. */
const shared = {env: {}, argv: ['node', 'vitest', 'run']};

describe('testWorkers', () => {
  it("leaves a CI runner to Vitest's default, whatever its size", () => {
    for (const cores of [4, 24, 40])
      for (const ci of ['true', '1', 'TRUE'])
        expect(
          testWorkers({cores, memory: 256 * GiB, ...shared, env: {CI: ci}}),
          `${cores} cores, CI=${ci}`,
        ).toBeUndefined();
  });

  it('caps a run where CI is unset, empty, "0" or "false"', () => {
    expect(testWorkers({cores: 40, memory: 256 * GiB, ...shared})).toBe(
      MOST_WORKERS,
    );
    for (const ci of ['', '0', 'false', 'FALSE'])
      expect(
        testWorkers({cores: 40, memory: 256 * GiB, ...shared, env: {CI: ci}}),
        `CI=${ci}`,
      ).toBe(MOST_WORKERS);
  });

  it('leaves a worker count on the command line to Vitest', () => {
    for (const flag of [
      ['--maxWorkers=2'],
      ['--maxWorkers', '2'],
      ['--max-workers=2'],
    ])
      expect(
        testWorkers({
          cores: 40,
          memory: 256 * GiB,
          env: {},
          argv: ['node', 'vitest', 'run', ...flag],
        }),
        flag.join(' '),
      ).toBeUndefined();
  });

  it('caps a run that is surely a single run', () => {
    for (const words of [
      ['run'],
      ['list'],
      ['--run'],
      ['run', '-u'],
      ['run', 'packages/cli'],
      ['run', '--project', 'node'],
    ])
      expect(
        testWorkers({
          cores: 10,
          memory: 64 * GiB,
          env: {},
          argv: ['node', 'vitest', ...words],
        }),
        words.join(' '),
      ).toBe(MOST_WORKERS);
  });

  it('leaves a watch, or a command line it cannot read, to Vitest', () => {
    for (const words of [
      [],
      ['watch'],
      ['--coverage'],
      ['run', '--watch'],
      ['run', '-w'],
      ['run', '-uw'],
      ['run', '-w=true'],
      ['run', '--watch=1'],
      ['run', '--watch', '--run'],
      // A value that turns watch off still leaves the run to Vitest.
      ['run', '--watch=false'],
      ['run', '--no-watch'],
      // `run` or `list` as a filter or pattern, or after an option.
      ['watch', 'list'],
      ['-t', 'run'],
      ['--project', 'ui', 'run'],
      // Vitest reads no option after `--`.
      ['--', '--run'],
      ['watch', '--', '--run'],
      ['run', '--', 'x'],
    ])
      expect(
        testWorkers({
          cores: 10,
          memory: 64 * GiB,
          env: {},
          argv: ['node', 'vitest', ...words],
        }),
        words.join(' ') || '(no words)',
      ).toBeUndefined();
  });

  it('keeps 3 workers on a shared 4-core machine', () => {
    expect(testWorkers({cores: 4, memory: 16 * GiB, ...shared})).toBe(3);
  });

  it('runs at most 8 on a shared many-core machine', () => {
    for (const cores of [10, 16, 40, 174])
      expect(
        testWorkers({cores, memory: 256 * GiB, ...shared}),
        `${cores} cores`,
      ).toBe(MOST_WORKERS);
  });

  it('runs one worker per 2 GiB of memory when memory is short', () => {
    expect(testWorkers({cores: 40, memory: 8 * GiB, ...shared})).toBe(4);
    expect(testWorkers({cores: 40, memory: 5 * GiB, ...shared})).toBe(2);
  });

  it('runs at least one worker', () => {
    expect(testWorkers({cores: 1, memory: 16 * GiB, ...shared})).toBe(1);
    expect(testWorkers({cores: 8, memory: 1 * GiB, ...shared})).toBe(1);
  });

  it('leaves every project without a count of its own', () => {
    // A project with its own maxWorkers would differ from the others in the
    // same group, which Vitest refuses, and would hide a --maxWorkers flag.
    for (const project of config.test?.projects ?? []) {
      if (typeof project !== 'object' || !('test' in project)) continue;
      expect(project.test?.maxWorkers, project.test?.name).toBeUndefined();
    }
  });
});

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/**
 * The worker count Vitest gives each project of a `ui` + `node` run started
 * with `flags`, as its own worker resolution reads it: a project's own value,
 * else the root's, else Vitest's default. The run is set up, never started.
 * @param {string[]} flags
 * @param {Record<string, string>} env
 * @param {number} [cores]
 * @returns {Record<string, number | null>}
 */
function resolvedWorkers(flags, env, cores) {
  // A machine with that many cores, when given: Vitest and testWorkers() both
  // read os.availableParallelism().
  const machine = cores
    ? `const os = (await import('node:os')).default;
       os.availableParallelism = () => ${cores};
       (await import('node:module')).syncBuiltinESMExports();`
    : '';
  const script = `
    ${machine}
    process.argv.push('vitest', 'run', ...${JSON.stringify(flags)});
    const {createVitest, parseCLI} = await import('vitest/node');
    const {options} = parseCLI(['vitest', 'run', '--project', 'ui', '--project', 'node', ...${JSON.stringify(flags)}]);
    const vitest = await createVitest('test', {...options, watch: false});
    const counts = {};
    for (const project of vitest.projects)
      counts[project.name] = project.config.maxWorkers || vitest.config.maxWorkers || null;
    await vitest.close();
    console.log(JSON.stringify(counts));
  `;
  // A shared machine: no CI, and none of this run's own Vitest variables.
  /** @type {Record<string, string | undefined>} */
  const childEnv = {...process.env};
  for (const key of Object.keys(childEnv))
    if (key === 'CI' || key.startsWith('VITEST') || key === 'NODE_OPTIONS')
      delete childEnv[key];
  Object.assign(childEnv, env);
  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {cwd: repoRoot, env: childEnv, encoding: 'utf8'},
  );
  return JSON.parse(out.trim().split('\n').at(-1) ?? '{}');
}

describe('a ui + node run on a shared machine', () => {
  it(
    "gives every project the root count, not Vitest's default, on 40 cores",
    {timeout: 120_000},
    () => {
      // Vitest's default there is 39, so a root value that went missing shows.
      const expected = testWorkers({
        cores: 40,
        env: {},
        argv: ['node', 'vitest', 'run'],
      });
      expect(resolvedWorkers([], {}, 40)).toEqual({
        ui: expected,
        node: expected,
      });
    },
  );

  it('gives every project the --maxWorkers count', {timeout: 120_000}, () => {
    expect(resolvedWorkers(['--maxWorkers=2'], {})).toEqual({ui: 2, node: 2});
  });

  it(
    'gives every project the VITEST_MAX_WORKERS count, below the cap',
    {timeout: 120_000},
    () => {
      expect(resolvedWorkers([], {VITEST_MAX_WORKERS: '2'})).toEqual({
        ui: 2,
        node: 2,
      });
    },
  );
});
