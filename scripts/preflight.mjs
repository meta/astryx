#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Preflight: the pre-review report and CI's checks for one change, run
 *   locally before the change is marked ready.
 * @input The committed change (`HEAD` against its merge base with `--base
 *   <ref>`, default `origin/main`), `--browser`, `--quick` (the
 *   changed packages, files and tests alone; not CI's scope; a typecheck
 *   that fails only on missing workspace builds reports SKIP), and `--wrap
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

import {expandWorkspaceDirs} from './lib/workspace-globs.mjs';

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
 * arguments the command does not run (`emptyMeans` says why). `argsAfter`
 * goes after them: an option such as Playwright's `--project`, which takes
 * every value that follows it, must come last.
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
  if (quick) return quickChecks({scope, mergeBase, changed, tmp});
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
              argv: ['pnpm', 'test:interaction'],
              argsFrom: selection,
              argsAfter: ['--project', 'chromium'],
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
function quickChecks({scope, mergeBase, changed, tmp}) {
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
              // Without a build, a package that reads a workspace package's
              // build output fails to typecheck: that is not this change's
              // error, so the check reports it as skipped.
              stdout: path.join(tmp, 'typecheck.log'),
              tee: true,
              skipWhen: missingBuilds,
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

const MISSING_BUILDS =
  'skipped, workspace builds missing; run `pnpm build` first';

/** An unresolved module and its specifier. */
const UNRESOLVED = /error TS2307: Cannot find module '([^']+)'/;

/** A relative path into a `dist` folder: a workspace package's build output. */
const DIST_PATH = /^\.\.?\/(?:[^']*\/)?dist(?:\/[^']*)?$/;

/** An implicit-any error, which an unresolved import causes in its own file. */
const IMPLICIT_ANY = /error TS(?:7006|7031):/;

/** The file a TypeScript error line names: the text before `(line,col)`. */
const errorFile = line =>
  line.match(/^(.*?)\(\d+,\d+\): error TS/)?.[1] ?? null;

/**
 * The file an `exports` entry names for type checking: its `types` target,
 * else its `default`, `import` or `require` target (conditions may nest).
 * @param {unknown} target
 * @returns {string | null}
 */
function typesTarget(target) {
  if (typeof target === 'string') return target;
  if (!target || typeof target !== 'object') return null;
  for (const condition of ['types', 'default', 'import', 'require']) {
    const file = typesTarget(target[condition]);
    if (file) return file;
  }
  return null;
}

/**
 * Whether an unresolved workspace import is a build that `pnpm build` writes:
 * its package (a folder `pnpm-workspace.yaml` lists) declares the entry in
 * `exports`, and the file that entry names for types is absent. An unknown
 * package, an undeclared subpath, or an entry whose file exists (an import
 * from a package the importer does not depend on) is a real error.
 * @param {string} root the repository root
 * @returns {(specifier: string) => boolean}
 */
export function workspaceExports(root = ROOT) {
  /** @type {Map<string, {dir: string, exports: unknown}>} */
  const packages = new Map();
  for (const dir of expandWorkspaceDirs(root)) {
    const file = path.join(dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const {name, exports} = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (name?.startsWith('@astryxdesign/')) packages.set(name, {dir, exports});
  }
  return specifier => {
    const [, name, subpath] =
      specifier.match(/^(@astryxdesign\/[^/]+)(?:\/(.+))?$/) ?? [];
    const found = name ? packages.get(name) : undefined;
    if (!found?.exports) return false;
    const wanted = subpath ? `./${subpath}` : '.';
    const entries =
      typeof found.exports === 'object' &&
      Object.keys(found.exports).some(key => key.startsWith('.'))
        ? Object.entries(found.exports)
        : [['.', found.exports]];
    for (const [key, target] of entries) {
      const [head, tail] = key.split('*');
      const matched =
        tail === undefined
          ? key === wanted && ''
          : wanted.length > head.length + tail.length &&
              wanted.startsWith(head) &&
              wanted.endsWith(tail)
            ? wanted.slice(head.length, wanted.length - tail.length)
            : false;
      if (matched === false) continue;
      const file = typesTarget(target);
      if (!file) return false;
      return !fs.existsSync(
        path.join(found.dir, file.split('*').join(matched)),
      );
    }
    return false;
  };
}

let defaultExports;

/**
 * Why a failed typecheck is skipped, or null: every TypeScript error is a
 * missing build output, or an implicit-any error (TS7006, TS7031) in a file
 * that also has a missing build output. A missing build output is an
 * unresolved import that a workspace package's `exports` declares and whose
 * types file is absent (workspaceExports), or a relative path into a `dist`
 * folder. An undeclared subpath, an unknown package, an entry whose file
 * exists, a third-party module, an implicit-any error in any other file, and
 * any other error are real.
 * @param {string} text the typecheck's output
 * @param {{declares?: (specifier: string) => boolean}} [options]
 * @returns {string | null}
 */
export function missingBuilds(text, {declares} = {}) {
  const errors = text.split('\n').filter(line => /error TS\d+/.test(line));
  if (errors.length === 0) return null;
  const isDeclared = declares ?? (defaultExports ??= workspaceExports());
  const missing = line => {
    const specifier = line.match(UNRESOLVED)?.[1];
    return (
      specifier != null &&
      (DIST_PATH.test(specifier) ||
        (specifier.startsWith('@astryxdesign/') && isDeclared(specifier)))
    );
  };
  const unresolved = new Set(errors.filter(missing).map(errorFile));
  const followOn = line =>
    IMPLICIT_ANY.test(line) &&
    errorFile(line) != null &&
    unresolved.has(errorFile(line));
  if (!errors.every(line => missing(line) || followOn(line))) return null;
  return MISSING_BUILDS;
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
      if (command.argsAfter) argv = [...argv, ...command.argsAfter];
      if (command.kind !== 'light' && wrap.length)
        argv = [...wrap, command.kind, ...argv];
      const code = exec(argv, {
        env: command.env,
        stdout: command.stdout,
        tee: command.tee,
      });
      const skipped =
        code !== 0 && command.skipWhen && command.stdout
          ? command.skipWhen(
              fs.existsSync(command.stdout)
                ? fs.readFileSync(command.stdout, 'utf8')
                : '',
            )
          : null;
      if (skipped)
        return {
          id: check.id,
          result: 'SKIP',
          note: skipped,
          failed: null,
          seconds: Math.round((now() - started) / 1000),
        };
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
  // A typecheck skipped for missing builds checked nothing, so the verdict
  // says so instead of reading as a pass.
  const unbuilt = rows.filter(
    row => row.result === 'SKIP' && row.note === MISSING_BUILDS,
  );
  lines.push(
    '',
    failed.length
      ? `not ready: ${failed.length}`
      : unbuilt.length
        ? `not checked: ${unbuilt.map(row => row.id).join(', ')} (workspace builds missing); run \`pnpm build\`, then run again before you flip`
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
    exec(command, {env, stdout, tee}) {
      console.log(`\n== ${command.join(' ')}`);
      if (stdout && tee) {
        // Shows the output and keeps it for the check to read.
        const result = spawnSync(command[0], command.slice(1), {
          cwd: ROOT,
          env: {...process.env, ...env},
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 256 * 1024 * 1024,
        });
        const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
        process.stdout.write(text);
        fs.writeFileSync(stdout, text);
        return result.status ?? 1;
      }
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
