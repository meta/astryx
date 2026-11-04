// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown.fr23.perf.test.ts
 * @input The FR23 benchmark, run as its own process
 * @output The exact `spec:AST-036` FR23 gate against the empty pipeline
 * @position Overhead budget evidence for the canonical plugin protocol
 *
 * The measurement does not run here. This file spawns
 * `Markdown.fr23.bench.ts` as a dedicated Node process, one section size at
 * a time, and only asserts on what that process reports.
 *
 * A fresh process isolates engine state left by other plugin configurations,
 * but it still shares CPU and memory with other Vitest workers. CI and Deploy
 * exclude this file from the parallel UI suite, then run it alone after those
 * workers exit, as the spec's isolated-process-and-runner protocol requires.
 * Local measurements need the same isolation from other test and build work.
 *
 * The timed region inside each process is the spec's protocol, unsmoothed:
 * ten untimed warmups, then one median of nine alternating paired rounds,
 * for a stable plugin list and a recreated equivalent one, against the
 * omitted baseline, timed on the main thread's CPU clock. A first attempt within budget on both paths certifies
 * them. Otherwise up to nine fresh-process attempts decide each path on its
 * own: a path fails the unchanged budget when a majority of the nine (five)
 * exceed it, and collection stops as soon as both paths are decided.
 */

import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker} from 'node:worker_threads';
import {afterAll, describe, expect, it} from 'vitest';
import {
  mainThreadCpuTime,
  measureMarkdownPairedRatio,
} from './Markdown.fr23.sampling';

interface BenchmarkResult {
  readonly sections: number;
  readonly stable: number;
  readonly recreated: number;
  /** An A/A run: identical work both sides, so 1.0 is a perfect machine. */
  readonly control: number;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
// Inside the repo so the bootstrap can resolve `esbuild` by bare specifier,
// and under node_modules so it is ignored and swept with the install.
const workspace = mkdtempSync(
  path.join(repoRoot, 'node_modules', '.astryx-fr23-'),
);

afterAll(() => {
  rmSync(workspace, {recursive: true, force: true});
});

/**
 * Compiles the benchmark and runs it, inside the spawned process.
 *
 * esbuild cannot run in this suite's jsdom environment (it asserts on a
 * native `TextEncoder`), and the benchmark must not share a process with the
 * runner anyway — so the compile happens out there too.
 */
const bootstrap = path.join(workspace, 'bootstrap.mjs');
writeFileSync(
  bootstrap,
  [
    "import {build} from 'esbuild';",
    "import {pathToFileURL} from 'node:url';",
    'const [entry, outfile, sections] = process.argv.slice(2);',
    'await build({',
    '  entryPoints: [entry],',
    '  outfile,',
    '  bundle: true,',
    "  format: 'esm',",
    "  platform: 'node',",
    "  target: 'node22',",
    "  logLevel: 'silent',",
    '});',
    'process.argv = [process.argv[0], outfile, sections];',
    'await import(pathToFileURL(outfile).href);',
  ].join('\n'),
);

/**
 * Runs one benchmark process and returns what it reported.
 *
 * Throws on a non-zero exit, on output that is not JSON, and on a result
 * whose ratios are unusable. A measurement that did not happen must never
 * read as a measurement that passed.
 */
function runBenchmark(
  argv: ReadonlyArray<string>,
  sections: number,
): BenchmarkResult {
  let stdout: string;
  try {
    stdout = execFileSync(process.execPath, [...argv], {
      encoding: 'utf8',
      timeout: 300_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // The benchmark reports contention diagnostics on stderr; surface them.
  } catch (error) {
    const reason = error as {status?: number; stderr?: string};
    throw new Error(
      `FR23 benchmark process failed (exit ${reason.status ?? 'unknown'}): ${
        reason.stderr?.trim() ?? String(error)
      }`,
      {cause: error},
    );
  }
  const line = stdout.trim().split('\n').pop() ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new Error(`FR23 benchmark produced no result: ${stdout.trim()}`);
  }
  const result = parsed as Partial<BenchmarkResult>;
  if (
    result.sections !== sections ||
    !Number.isFinite(result.stable) ||
    !Number.isFinite(result.recreated) ||
    !Number.isFinite(result.control)
  ) {
    throw new Error(`FR23 benchmark returned an unusable result: ${line}`);
  }
  return result as BenchmarkResult;
}

function benchmarkArgv(sections: number): ReadonlyArray<string> {
  return [
    bootstrap,
    path.join(here, 'Markdown.fr23.bench.ts'),
    path.join(workspace, `fr23-${sections}.mjs`),
    String(sections),
  ];
}

const FR23_BUDGET = 1.25;

function exceedsFR23Budget(result: BenchmarkResult): boolean {
  return result.stable > FR23_BUDGET || result.recreated > FR23_BUDGET;
}

function runSettledBenchmark(sections: number): BenchmarkResult {
  let measured = runBenchmark(benchmarkArgv(sections), sections);
  for (let retry = 0; retry < 2 && measured.control > FR23_BUDGET; retry++) {
    console.log(
      `  ${sections} sections: A/A control ${measured.control.toFixed(3)} —` +
        ' machine too contended to measure; retrying',
    );
    measured = runBenchmark(benchmarkArgv(sections), sections);
  }
  if (measured.control > FR23_BUDGET) {
    throw new Error(
      'the machine was too contended to measure FR23; this is an ' +
        'environment failure, not a helper regression',
    );
  }
  return measured;
}

/**
 * The ratios depend on the processor, so each line names it: a runner on a
 * different CPU model shows up in the log rather than as an unexplained shift.
 */
const CPU_MODEL = os.cpus()[0]?.model.trim() ?? 'unknown CPU';

function logBenchmarkResult(result: BenchmarkResult, attempt: number): void {
  console.log(
    `  ${result.sections} sections, attempt ${attempt}, FR23 representative set over empty:` +
      ` stable ${result.stable.toFixed(3)}, recreated ${result.recreated.toFixed(3)}` +
      ` (budget ${FR23_BUDGET}, A/A control ${result.control.toFixed(3)}; ${CPU_MODEL})`,
  );
}

/** The two paths FR23 measures; each is held to the budget on its own. */
const FR23_PATHS = ['stable', 'recreated'] as const;
type FR23Path = (typeof FR23_PATHS)[number];

/**
 * Fresh-process attempts that decide a path after a noisy first one. On CI a
 * clean representative set measures about 1.19 at 500 sections with about
 * ±0.04 of sample noise, so a single attempt lands over the budget roughly
 * one time in ten; a majority of nine does so well under one time in a
 * thousand, while a slowdown of 0.1 or more still exceeds it nearly always.
 */
const FR23_ATTEMPTS = 9;
const FR23_MAJORITY = Math.floor(FR23_ATTEMPTS / 2) + 1;

function attemptsOverBudget(
  attempts: ReadonlyArray<BenchmarkResult>,
  fr23Path: FR23Path,
): number {
  return attempts.filter(result => result[fr23Path] > FR23_BUDGET).length;
}

/** Whether the remaining attempts can no longer change this path's verdict. */
function pathDecided(
  attempts: ReadonlyArray<BenchmarkResult>,
  fr23Path: FR23Path,
): boolean {
  const over = attemptsOverBudget(attempts, fr23Path);
  return over >= FR23_MAJORITY || attempts.length - over >= FR23_MAJORITY;
}

function collectFR23Attempts(
  sections: number,
  runAttempt: (sections: number) => BenchmarkResult = runSettledBenchmark,
): ReadonlyArray<BenchmarkResult> {
  const attempts = [runAttempt(sections)];
  if (!exceedsFR23Budget(attempts[0])) {
    return attempts;
  }
  while (
    attempts.length < FR23_ATTEMPTS &&
    !FR23_PATHS.every(fr23Path => pathDecided(attempts, fr23Path))
  ) {
    attempts.push(runAttempt(sections));
  }
  return attempts;
}

/** The paths whose attempts exceed the budget in a majority of nine. */
function pathsOverBudget(
  attempts: ReadonlyArray<BenchmarkResult>,
): ReadonlyArray<FR23Path> {
  return FR23_PATHS.filter(fr23Path =>
    attempts.length > 1
      ? attemptsOverBudget(attempts, fr23Path) >= FR23_MAJORITY
      : attemptsOverBudget(attempts, fr23Path) > 0,
  );
}

describe('Markdown FR23 helper overhead', () => {
  it('reports one nine-pair median without selecting the cheapest baseline', () => {
    // Paired ratios: four 1.1s, one 1.2, four 10s. The median is 1.2,
    // whereas dividing the separate medians would give 10. Later attempts
    // have a cheaper baseline but a ratio of 2: selecting them biases the
    // result even though the selector never inspects candidate times.
    const baselineCosts = [1000, 1000, 1000, 1000, 10, 10, 10, 10, 10];
    const candidateCosts = [1100, 1100, 1100, 1100, 12, 100, 100, 100, 100];
    const calls: string[] = [];
    let elapsed = 0;
    const callback = (name: string, costs: ReadonlyArray<number>) => {
      let count = 0;
      return () => {
        count++;
        calls.push(name);
        elapsed +=
          count <= 10
            ? 100
            : (costs[Math.floor((count - 11) / 20)] ?? (name === 'B' ? 5 : 10));
        return count;
      };
    };

    expect(
      measureMarkdownPairedRatio(
        callback('B', baselineCosts),
        callback('C', candidateCosts),
        () => elapsed,
      ),
    ).toBeCloseTo(1.2, 10);
    expect(calls).toHaveLength(2 * (10 + 9 * 20));
    expect(calls.slice(0, 20).join('')).toBe('BC'.repeat(10));
    for (let round = 0; round < 9; round++) {
      const pair = ['B'.repeat(20), 'C'.repeat(20)];
      expect(calls.slice(20 + round * 40, 60 + round * 40).join('')).toBe(
        (round % 2 === 0 ? pair : pair.reverse()).join(''),
      );
    }
  });

  it("times only the main thread, not V8's or a worker's background threads", async () => {
    // A worker spins for 300 ms of CPU while this thread sleeps without any.
    // The process clock counts the worker's time; the sampling clock must not.
    const flag = new Int32Array(new SharedArrayBuffer(4));
    const processBefore = process.cpuUsage();
    const threadBefore = mainThreadCpuTime();
    const worker = new Worker(
      `const {workerData} = require('node:worker_threads');
       const end = Date.now() + 300;
       while (Date.now() < end) {}
       Atomics.store(workerData, 0, 1);
       Atomics.notify(workerData, 0);`,
      {eval: true, workerData: flag},
    );
    // A worker that dies before it finishes must fail the test, not hang it.
    const deadline = Date.now() + 10_000;
    while (Atomics.load(flag, 0) === 0) {
      if (Date.now() > deadline) {
        await worker.terminate();
        throw new Error('The CPU-spinning worker did not finish in 10 s');
      }
      Atomics.wait(flag, 0, 0, 50);
    }
    const thread = mainThreadCpuTime() - threadBefore;
    const processUsage = process.cpuUsage(processBefore);
    await worker.terminate();
    const processTime = processUsage.user + processUsage.system;
    expect(processTime).toBeGreaterThan(200_000);
    expect(thread).toBeLessThan(processTime / 4);
  });

  describe('deciding each path from fresh-process attempts', () => {
    const result = (stable: number, recreated: number): BenchmarkResult => ({
      sections: 500,
      stable,
      recreated,
      control: 1,
    });
    const run = (results: BenchmarkResult[]) => {
      const queue = [...results];
      let calls = 0;
      const attempts = collectFR23Attempts(500, () => {
        calls++;
        const next = queue.shift();
        if (next == null) {
          throw new Error('asked for an unplanned attempt');
        }
        return next;
      });
      return {attempts, calls, failing: pathsOverBudget(attempts)};
    };

    it('certifies both paths from one attempt within budget', () => {
      const {calls, failing} = run([result(1.2, 1.22)]);
      expect(calls).toBe(1);
      expect(failing).toEqual([]);
    });

    it('fails a single attempt over budget only if no retry ran', () => {
      expect(pathsOverBudget([result(1.26, 1.2)])).toEqual(['stable']);
    });

    it('judges each path by its own majority, not either path per attempt', () => {
      // Main run 38393555595: stable was over in attempt 1 and recreated in
      // attempt 2, which the old either-path-per-attempt count read as a
      // two-of-three failure although neither path was over in a majority.
      const {attempts, failing} = run([
        result(1.256, 1.201),
        result(1.145, 1.275),
        result(1.183, 1.187),
        result(1.18, 1.2),
        result(1.19, 1.21),
        result(1.2, 1.22),
        result(1.17, 1.19),
      ]);
      // Each path needs five attempts within budget; each had one over.
      expect(attempts).toHaveLength(6);
      expect(failing).toEqual([]);
    });

    it('stops as soon as both paths are decided', () => {
      // Recreated is decided after five passes, stable after one more.
      const {calls} = run([
        result(1.3, 1.2),
        result(1.2, 1.2),
        result(1.2, 1.2),
        result(1.2, 1.2),
        result(1.2, 1.2),
        result(1.2, 1.2),
      ]);
      expect(calls).toBe(6);
    });

    it('fails a path that is over budget in a majority of nine', () => {
      const {attempts, failing} = run([
        result(1.3, 1.2),
        result(1.27, 1.2),
        result(1.2, 1.2),
        result(1.26, 1.21),
        result(1.22, 1.2),
        result(1.28, 1.19),
        result(1.26, 1.2),
      ]);
      expect(attempts).toHaveLength(7);
      expect(failing).toEqual(['stable']);
    });

    it('fails a consistent slowdown on both paths after five attempts', () => {
      const {calls, failing} = run(
        Array.from({length: 9}, () => result(1.4, 1.42)),
      );
      expect(calls).toBe(5);
      expect(failing).toEqual(['stable', 'recreated']);
    });

    it('never runs more than nine attempts', () => {
      const {calls} = run([
        result(1.3, 1.3),
        result(1.2, 1.2),
        result(1.3, 1.3),
        result(1.2, 1.2),
        result(1.3, 1.3),
        result(1.2, 1.2),
        result(1.3, 1.3),
        result(1.2, 1.2),
        result(1.3, 1.3),
      ]);
      expect(calls).toBe(9);
    });
  });

  it.each([200, 500])(
    'keeps the representative three-helper set within 25 percent of the empty pipeline at %i sections',
    sections => {
      // Each attempt is a whole fresh process running the exact protocol;
      // nothing is averaged across them. The A/A control decides whether an
      // attempt counts: a value over budget is machine noise, so that process
      // is replaced before its A/B result can certify or fail the helpers.
      //
      // A single over-budget A/B is also noisy at this threshold. Each path
      // is then decided by a majority of up to nine fresh-process attempts
      // against the unchanged 1.25 budget.
      const attempts = collectFR23Attempts(sections);
      if (attempts.length > 1) {
        console.log(
          `  ${sections} sections: first A/B exceeded ${FR23_BUDGET};` +
            ` decided each path from ${attempts.length} fresh processes`,
        );
      }
      attempts.forEach((result, index) =>
        logBenchmarkResult(result, index + 1),
      );
      const failing = pathsOverBudget(attempts);
      expect(
        failing,
        failing
          .map(
            fr23Path =>
              `${fr23Path}: ${attemptsOverBudget(attempts, fr23Path)} of ` +
              `${attempts.length} fresh FR23 attempts exceeded the ${FR23_BUDGET} budget`,
          )
          .join('; '),
      ).toEqual([]);
    },
    600_000,
  );

  it('fails loudly when the benchmark process cannot produce a result', () => {
    // The gate is only worth having if a measurement that did not happen
    // fails instead of passing quietly.
    const script = (name: string, contents: string): string => {
      const file = path.join(workspace, name);
      writeFileSync(file, contents);
      return file;
    };

    // A crash.
    expect(() =>
      runBenchmark([script('crash.mjs', 'process.exit(3);')], 200),
    ).toThrow(/exit 3/);

    // The benchmark's own argument guard, reached through the real bootstrap.
    expect(() =>
      runBenchmark([...benchmarkArgv(200).slice(0, 3), 'not-a-number'], 200),
    ).toThrow(/benchmark process failed/);

    // Output that is not a result at all.
    expect(() =>
      runBenchmark([script('silent.mjs', 'console.log("not json");')], 200),
    ).toThrow(/produced no result/);

    // A well-formed JSON line that is not a usable measurement.
    expect(() =>
      runBenchmark(
        [
          script(
            'wrong.mjs',
            'console.log(JSON.stringify({sections: 1, stable: null, recreated: 1}));',
          ),
        ],
        200,
      ),
    ).toThrow(/unusable result/);
  });
});
