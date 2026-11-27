// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Vitest worker count on a machine (testWorkers): a command-line
 *   count and a CI runner keep Vitest's own count, a shared many-core machine
 *   runs at most 8, and a shared machine with little memory runs one worker
 *   per 2 GiB.
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

  it("keeps a watch run at or below Vitest's watch default, half the cores", () => {
    const watch = (/** @type {string[]} */ ...words) => ({
      env: {},
      argv: ['node', 'vitest', ...words],
    });
    expect(testWorkers({cores: 10, memory: 64 * GiB, ...watch()})).toBe(5);
    expect(testWorkers({cores: 10, memory: 64 * GiB, ...watch('watch')})).toBe(
      5,
    );
    expect(
      testWorkers({cores: 8, memory: 64 * GiB, ...watch('--coverage')}),
    ).toBe(4);
    expect(testWorkers({cores: 40, memory: 256 * GiB, ...watch()})).toBe(
      MOST_WORKERS,
    );
    expect(testWorkers({cores: 10, memory: 64 * GiB, ...watch('--run')})).toBe(
      MOST_WORKERS,
    );
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

  it('is the root maxWorkers, and no project sets its own', () => {
    // A project with its own maxWorkers would differ from the others in the
    // same group, which Vitest refuses, and would hide a --maxWorkers flag.
    expect(config.test?.maxWorkers).toBe(testWorkers());
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
 * @returns {Record<string, number | null>}
 */
function resolvedWorkers(flags, env) {
  const script = `
    process.argv.push('run', ...${JSON.stringify(flags)});
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
