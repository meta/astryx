#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Preflight: the pre-review report and CI's checks for one change, run
 *   locally before the change is marked ready.
 * @input The committed change (`HEAD` against its merge base with `--base
 *   <ref>`, default `origin/main`), `--browser`, `--quick` (the
 *   changed packages, files and tests alone; not CI's scope), and `--wrap
 *   <command>` (or `PREFLIGHT_WRAP`): a command that runs each heavy step as
 *   `<command> <build|test|knowledge> <step command...>`, such as a machine's
 *   job limiter. A working tree with uncommitted changes stops the run.
 * @output `pnpm review:pre`'s report, then each check with its own output, one
 *   PASS, FAIL or SKIP table, each failing command to copy, "ready to flip"
 *   or "not ready: N", and the CI checks it does not run. The exit code is 1
 *   when a check fails, 2 when the working tree has uncommitted changes.
 * @position `pnpm preflight`. It scopes the checks with CI's own classifier
 *   (`.github/scripts/change-scope.cjs`), test listers and Chromium selection,
 *   so it keeps no second copy of their rules. It reproduces the pre-review
 *   checklist and CI's checks; it is not a reviewer's judgment.
 */
/* global console, process */
import {spawnSync, execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A pass covers only the checks above, so the verdict says so. */
export const NOT_RUN =
  'CI can run more for this change than the checks above: whole-repository lint and its text and comment checks, the build tests, and the browser, visual, WebKit, accessibility and docsite jobs. CI decides.';

/** Files CI's formatting step checks with Prettier. */
const FORMATTED = /\.(?:tsx?|md)$/;

/** Files ESLint lints. */
const LINTED = /\.(?:[cm]?[jt]sx?)$/;
/** Vitest test files. */
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

/**
 * The checks for a change, in the order they run. Each check is a list of
 * commands. A command's `kind` is `light`, or `build`, `test` or `knowledge`
 * for a heavy one. `stdout` writes the command's output to a file. `argsFrom`
 * adds arguments read from a file a command before it wrote; with no such
 * arguments the command does not run (`emptyMeans` says why).
 * @param {{scope: ReturnType<typeof classify>, mergeBase: string, changed: string[], browser: boolean, tmp: string, chromiumScope?: string}} input
 */
export function planChecks({
  scope,
  mergeBase,
  changed,
  browser,
  tmp,
  chromiumScope,
  quick = false,
}) {
  if (quick) return quickChecks({scope, mergeBase, changed});
  const at = name => path.join(tmp, name);
  const checks = [];
  const specOnly = scope.specOnly || scope.timesOnly;
  const noBuild = specOnly || scope.docsiteOnly;
  // CI's typecheck job skips these lanes; the others build every package
  // first, since a package's types read its dependencies' build.
  const typechecks = !noBuild && !scope.toolingOnly;

  if (!noBuild)
    checks.push({
      id: 'build',
      commands: [
        {
          kind: 'build',
          // Without a typecheck, only the Node tests need a build: Core's.
          argv: typechecks
            ? ['pnpm', 'build']
            : ['pnpm', '--filter', '@astryxdesign/core', 'build'],
        },
      ],
    });
  checks.push(
    !typechecks
      ? skip('typecheck', 'CI runs no typecheck on this lane')
      : {
          id: 'typecheck',
          commands: [
            {
              kind: 'build',
              argv: scope.fullSuite
                ? ['pnpm', 'typecheck']
                : scope.labOnly
                  ? // CI's Lab lane typechecks Lab and the stories that import it.
                    [
                      'pnpm',
                      '-F',
                      '@astryxdesign/lab',
                      '-F',
                      '@astryxdesign/storybook',
                      'typecheck',
                    ]
                  : [
                      'pnpm',
                      '-r',
                      '--no-bail',
                      '--workspace-concurrency=1',
                      '--if-present',
                      '--filter',
                      `...[${mergeBase}]`,
                      '--filter',
                      '!@astryxdesign/docsite',
                      '--filter',
                      '!@astryxdesign/sandbox',
                      'run',
                      'typecheck',
                    ],
            },
          ],
        },
  );

  const linted = present(changed.filter(file => LINTED.test(file)));
  // CI checks the formatting of changed TypeScript and Markdown files, and not
  // on the docsite and spec lanes.
  const formatted =
    scope.docsiteOnly || specOnly
      ? []
      : present(changed.filter(file => FORMATTED.test(file)));
  checks.push({
    id: 'lint',
    commands: [
      ...(linted.length
        ? [
            {
              kind: 'light',
              argv: [
                'pnpm',
                'exec',
                'eslint',
                '--cache',
                '--no-warn-ignored',
                ...linted,
              ],
            },
          ]
        : []),
      ...(formatted.length
        ? [
            {
              kind: 'light',
              argv: [
                'pnpm',
                'exec',
                'prettier',
                '--check',
                '--ignore-unknown',
                ...formatted,
              ],
            },
          ]
        : []),
      {kind: 'light', argv: ['pnpm', 'check:repo']},
    ],
  });

  for (const project of ['ui', 'node']) {
    const id = `vitest ${project}`;
    if (scope.docsiteOnly || (project === 'ui' && scope.toolingOnly)) {
      checks.push(skip(id, `CI runs no ${project} tests on this lane`));
    } else if (specOnly) {
      // A spec-only change runs the tests that read a record it changes.
      const list = at(`${project}-readers.txt`);
      checks.push({
        id,
        commands: [
          {
            kind: 'light',
            argv: [
              'node',
              '.github/scripts/fs-guard-tests.mjs',
              '--spec-readers',
              '--project',
              project,
              '--changed',
              mergeBase,
            ],
            stdout: list,
          },
          {
            kind: 'test',
            argv: ['pnpm', 'exec', 'vitest', 'run', '--project', project],
            argsFrom: list,
            emptyMeans: 'no test reads a changed record',
          },
        ],
      });
    } else if (project === 'ui' && scope.labOnly) {
      const ran = at('lab-ran.json');
      const guards = at('lab-guards.txt');
      checks.push({
        id,
        commands: [
          {
            kind: 'test',
            argv: ['pnpm', 'test:ui', '--passWithNoTests', 'packages/lab/'],
          },
          {
            kind: 'light',
            argv: [
              'pnpm',
              'exec',
              'vitest',
              'list',
              '--project',
              'ui',
              'packages/lab/',
              '--filesOnly',
              '--passWithNoTests',
              `--json=${ran}`,
            ],
          },
          {
            kind: 'light',
            argv: [
              'node',
              '.github/scripts/fs-guard-tests.mjs',
              '--changed',
              mergeBase,
              '--already-run',
              ran,
            ],
            stdout: guards,
          },
          {
            kind: 'test',
            argv: ['pnpm', 'exec', 'vitest', 'run', '--project', 'ui'],
            argsFrom: guards,
            emptyMeans: 'no other test reads a changed source',
          },
        ],
      });
    } else if (scope.vitestFullSuite) {
      checks.push({
        id,
        commands: [{kind: 'test', argv: ['pnpm', `test:${project}`]}],
      });
    } else {
      // The tests the change reaches, and the guards no module graph relates
      // to it: CI's two listers, from the merge base.
      const reached = at(`${project}-reached.json`);
      const tests = at(`${project}-tests.txt`);
      checks.push({
        id,
        commands: [
          {
            kind: 'light',
            argv: [
              'pnpm',
              'exec',
              'vitest',
              'list',
              '--project',
              project,
              `--changed=${mergeBase}`,
              '--filesOnly',
              '--passWithNoTests',
              `--json=${reached}`,
            ],
          },
          {
            kind: 'light',
            argv: [
              'node',
              '.github/scripts/fs-guard-tests.mjs',
              '--changed',
              mergeBase,
              '--reached',
              reached,
            ],
            stdout: tests,
          },
          {
            kind: 'test',
            argv: [
              'pnpm',
              'exec',
              'vitest',
              'run',
              '--project',
              project,
              '--passWithNoTests',
            ],
            argsFrom: tests,
            emptyMeans: 'the change reaches no test',
          },
        ],
      });
    }
  }

  checks.push({
    id: 'knowledge',
    commands: [{kind: 'knowledge', argv: ['pnpm', 'check:knowledge']}],
  });
  checks.push({
    id: 'changesets',
    commands: [{kind: 'light', argv: ['pnpm', 'check:changesets']}],
  });

  if (browser) {
    if (noBuild) {
      checks.push(skip('browser', 'CI runs no browser specs on this lane'));
    } else {
      const listed = at('listed.txt');
      const changedList = at('changed.txt');
      const selection = at('chromium-selection.json');
      checks.push(
        {
          id: 'storybook build',
          commands: [{kind: 'build', argv: ['pnpm', 'storybook:build']}],
        },
        {
          id: 'a11y specs',
          commands: [
            {
              kind: 'test',
              argv: ['pnpm', 'test:a11y-contract:pr'],
              env: {BASE_SHA: mergeBase},
            },
          ],
        },
        {
          id: 'interaction specs',
          commands: [
            {kind: 'light', argv: ['git', 'ls-files'], stdout: listed},
            {
              kind: 'light',
              argv: [
                'node',
                '.github/scripts/playwright-legs.mjs',
                'select-chromium',
                '--listed',
                listed,
                '--changed',
                changedList,
                '--scope',
                chromiumScope ?? '.',
                '--full-suite',
                String(scope.fullSuite),
                '--root',
                '.',
                '--selection',
                '.github/interaction-selection.json',
                '--primitives',
                '.github/a11y-shared-primitives.json',
                '--out',
                selection,
              ],
              writes: {[changedList]: `${changed.join('\n')}\n`},
            },
            {
              kind: 'test',
              argv: ['pnpm', 'test:interaction', '--project', 'chromium'],
              argsFrom: selection,
              parse: chromiumSpecs,
              emptyMeans: 'the change selects no Chromium proof',
            },
          ],
        },
      );
    }
  }
  return checks;
}

/** Files that exist in the working tree (a deleted file has nothing to check). */
function present(files) {
  return files.filter(file => fs.existsSync(path.join(ROOT, file)));
}

/**
 * `--quick`: the typecheck of the changed packages alone (their dependencies'
 * build from an earlier `pnpm build`), ESLint on the changed files, the
 * changed test files alone, `check:knowledge` and `check:changesets`. It is
 * not CI's scope: no build, no dependent package, no test the change reaches
 * through an import, and no guard.
 */
function quickChecks({scope, mergeBase, changed}) {
  const specOnly = scope.specOnly || scope.timesOnly;
  const typechecks = !specOnly && !scope.docsiteOnly && !scope.toolingOnly;
  const linted = present(changed.filter(file => LINTED.test(file)));
  const tests = present(changed.filter(file => TEST_FILE.test(file)));
  return [
    typechecks
      ? {
          id: 'typecheck',
          commands: [
            {
              kind: 'build',
              argv: [
                'pnpm',
                '-r',
                '--no-bail',
                '--workspace-concurrency=1',
                '--if-present',
                '--filter',
                `[${mergeBase}]`,
                '--filter',
                '!@astryxdesign/docsite',
                '--filter',
                '!@astryxdesign/sandbox',
                'run',
                'typecheck',
              ],
            },
          ],
        }
      : skip('typecheck', 'CI runs no typecheck on this lane'),
    linted.length
      ? {
          id: 'lint',
          commands: [
            {
              kind: 'light',
              argv: [
                'pnpm',
                'exec',
                'eslint',
                '--cache',
                '--no-warn-ignored',
                ...linted,
              ],
            },
          ],
        }
      : skip('lint', 'no changed file to lint'),
    tests.length
      ? {
          id: 'changed tests',
          commands: [
            {
              kind: 'test',
              argv: [
                'pnpm',
                'exec',
                'vitest',
                'run',
                '--passWithNoTests',
                ...tests,
              ],
            },
          ],
        }
      : skip('changed tests', 'no changed test file'),
    {
      id: 'knowledge',
      commands: [{kind: 'knowledge', argv: ['pnpm', 'check:knowledge']}],
    },
    {
      id: 'changesets',
      commands: [{kind: 'light', argv: ['pnpm', 'check:changesets']}],
    },
  ];
}

function skip(id, why) {
  return {id, commands: [], skip: why};
}

/**
 * The spec files a Chromium selection names; null for the full suite (run
 * with no file arguments).
 * @param {string} text
 */
export function chromiumSpecs(text) {
  const result = JSON.parse(text);
  return result.full ? null : result.specs;
}

/**
 * Runs each check's commands in turn; a failing command ends its check, and
 * the next check still runs. `exec(argv, {env, stdout})` returns the exit
 * code.
 * @returns {{id: string, result: 'PASS' | 'FAIL' | 'SKIP', note: string, failed: string | null, seconds: number}[]}
 */
export function runChecks(checks, {exec, wrap = [], now = Date.now} = {}) {
  return checks.map(check => {
    if (check.skip)
      return {
        id: check.id,
        result: 'SKIP',
        note: check.skip,
        failed: null,
        seconds: 0,
      };
    const started = now();
    let note = '';
    for (const command of check.commands) {
      for (const [file, text] of Object.entries(command.writes ?? {}))
        fs.writeFileSync(file, text);
      let argv = command.argv;
      if (command.argsFrom) {
        const text = fs.existsSync(command.argsFrom)
          ? fs.readFileSync(command.argsFrom, 'utf8')
          : '';
        const extra = command.parse
          ? command.parse(text)
          : text.split('\n').filter(Boolean);
        if (extra != null && extra.length === 0) {
          note = command.emptyMeans ?? '';
          continue;
        }
        argv = [...argv, ...(extra ?? [])];
      }
      if (command.kind !== 'light' && wrap.length)
        argv = [...wrap, command.kind, ...argv];
      const code = exec(argv, {env: command.env, stdout: command.stdout});
      if (code !== 0)
        return {
          id: check.id,
          result: 'FAIL',
          note: `exit ${code}`,
          failed: argv.join(' '),
          seconds: Math.round((now() - started) / 1000),
        };
    }
    return {
      id: check.id,
      result: 'PASS',
      note,
      failed: null,
      seconds: Math.round((now() - started) / 1000),
    };
  });
}

/**
 * The table, the failing commands and the verdict.
 * @param {{id: string, result: string, note: string, failed: string | null, seconds: number}[]} rows
 */
export function formatTable(rows, {quick = false} = {}) {
  const width = Math.max(...rows.map(row => row.id.length), 5);
  const lines = [
    `${'CHECK'.padEnd(width)}  RESULT  TIME  NOTE`,
    ...rows.map(row =>
      `${row.id.padEnd(width)}  ${row.result.padEnd(6)}  ${`${row.seconds}s`.padStart(4)}  ${row.note}`.trimEnd(),
    ),
  ];
  const failed = rows.filter(row => row.result === 'FAIL');
  if (failed.length) {
    lines.push('', 'Failing commands:');
    for (const row of failed) lines.push(`  ${row.id}: ${row.failed}`);
  }
  lines.push(
    '',
    failed.length
      ? `not ready: ${failed.length}`
      : quick
        ? 'quick checks pass; run `pnpm preflight` before you flip'
        : 'ready to flip',
    quick
      ? 'Quick mode is not CI-equivalent: it skips the build, dependent packages, the tests the change reaches and the guards.'
      : NOT_RUN,
    'Preflight reproduces the pre-review checklist and CI checks; a reviewer still judges the change.',
  );
  return lines.join('\n');
}

/**
 * Why preflight stops before any check, or null. CI's test listers diff
 * commits, so an uncommitted edit would choose a lane whose tests never see
 * it: preflight checks committed work alone. With no change it has nothing to
 * check, as `pnpm review:pre` says.
 * @param {{dirty: boolean, changes: number, base: string}} input
 * @returns {{code: number, message: string} | null}
 */
export function stopReason({dirty, changes, base}) {
  if (dirty)
    return {
      code: 2,
      message:
        'Preflight checks committed work, as CI does: commit your changes first, then run it again.',
    };
  if (changes === 0) return {code: 0, message: `No changes against ${base}.`};
  return null;
}

/** CI's classification of the change (change-scope.cjs). */
export function classify(changes) {
  const {classifyChanges} = require('../.github/scripts/change-scope.cjs');
  return classifyChanges(changes);
}

/** The path pattern ci.yml's Chromium selection step scopes the proofs by. */
export function chromiumScopeFromCi(text) {
  const yaml = require('yaml');
  const job = yaml.parse(text).jobs?.['interaction-legs'];
  const step = job?.steps?.find(each => each.id === 'select-chromium');
  return step?.env?.SCOPE_PATHS ?? null;
}

function gitText(args) {
  return execFileSync('git', args, {cwd: ROOT, encoding: 'utf8'}).trim();
}

function valueOf(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${flag} requires a value.`);
  return value;
}

async function main(argv) {
  const base = valueOf(argv, '--base') ?? 'origin/main';
  const wrapText = valueOf(argv, '--wrap') ?? process.env.PREFLIGHT_WRAP ?? '';
  const wrap = wrapText.split(/\s+/).filter(Boolean);
  const dirty = gitText(['status', '--porcelain']) !== '';
  const mergeBase = dirty ? '' : gitText(['merge-base', base, 'HEAD']);
  const {buildReport, changedFiles, formatReport} =
    await import('./pre-review.mjs');
  const changes = dirty ? [] : changedFiles(mergeBase, 'HEAD');
  const stop = stopReason({dirty, changes: changes.length, base});
  if (stop) {
    (stop.code ? console.error : console.log)(stop.message);
    process.exitCode = stop.code;
    return;
  }
  const scope = classify(changes);
  const changed = [
    ...new Set(
      changes.flatMap(change =>
        change.previous_filename
          ? [change.filename, change.previous_filename]
          : [change.filename],
      ),
    ),
  ];
  console.log(
    `Preflight against ${base} (merge base ${mergeBase.slice(0, 10)}): ${changed.length} changed file(s); ${scope.reason}.`,
  );

  const report = buildReport({base, head: 'HEAD'});
  console.log(`\n== review:pre\n${formatReport(report)}`);
  const reviewRow = {
    id: 'review:pre',
    result: report.findings.length ? 'FAIL' : 'PASS',
    note: report.findings.length
      ? `${report.findings.length} finding(s) above`
      : 'checklist above',
    failed: report.findings.length
      ? `pnpm review:pre --base ${base} --head HEAD`
      : null,
    seconds: 0,
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
  const quick = argv.includes('--quick');
  const browser = !quick && argv.includes('--browser');
  const checks = planChecks({
    scope,
    mergeBase,
    changed,
    browser,
    quick,
    tmp,
    chromiumScope: browser
      ? chromiumScopeFromCi(
          fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'),
        )
      : undefined,
  });
  const rows = runChecks(checks, {
    wrap,
    exec(command, {env, stdout}) {
      console.log(`\n== ${command.join(' ')}`);
      const out = stdout ? fs.openSync(stdout, 'w') : 'inherit';
      const result = spawnSync(command[0], command.slice(1), {
        cwd: ROOT,
        env: {...process.env, ...env},
        stdio: ['ignore', out, 'inherit'],
      });
      if (typeof out === 'number') fs.closeSync(out);
      return result.status ?? 1;
    },
  });
  const all = [reviewRow, ...rows];
  console.log(`\n${formatTable(all, {quick})}`);
  process.exitCode = all.some(row => row.result === 'FAIL') ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
