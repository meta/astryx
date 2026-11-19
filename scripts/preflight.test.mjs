// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file preflight.test.mjs
 * @input preflight.mjs's planner, runner and table, with a fake command
 *   runner, and ci.yml.
 * @output Which checks each lane runs, that a failing check fails the run
 *   and names its command while the other checks still run, that the
 *   wrapper takes only heavy steps, and that the Chromium scope comes from
 *   ci.yml.
 * @position A Node test; it runs no check itself.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  chromiumScopeFromCi,
  chromiumSpecs,
  classify,
  formatTable,
  planChecks,
  runChecks,
  stopReason,
} from './preflight.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-'));
const change = filename => ({filename, status: 'modified'});
const plan = (files, extra = {}) =>
  planChecks({
    scope: classify(files.map(change)),
    mergeBase: 'abc123',
    changed: files,
    browser: false,
    tmp: tmp(),
    ...extra,
  });
const byId = (checks, id) => checks.find(check => check.id === id);
const argvs = check => check.commands.map(command => command.argv.join(' '));

describe('planChecks', () => {
  it('scopes a component change with CI listers from the merge base', () => {
    const checks = plan(['packages/core/src/Button/Button.tsx']);
    expect(checks.map(check => check.id)).toEqual([
      'build',
      'typecheck',
      'lint',
      'vitest ui',
      'vitest node',
      'knowledge',
      'changesets',
    ]);
    expect(argvs(byId(checks, 'build'))).toEqual(['pnpm build']);
    expect(argvs(byId(checks, 'typecheck'))[0]).toContain(
      '--filter ...[abc123]',
    );
    expect(argvs(byId(checks, 'lint'))).toEqual([
      'pnpm exec eslint --cache --no-warn-ignored packages/core/src/Button/Button.tsx',
      'pnpm exec prettier --check --ignore-unknown packages/core/src/Button/Button.tsx',
      'pnpm check:repo',
    ]);
    const ui = argvs(byId(checks, 'vitest ui'));
    expect(ui[0]).toContain('vitest list --project ui --changed=abc123');
    expect(ui[1]).toContain('fs-guard-tests.mjs --changed abc123 --reached');
    expect(ui[2]).toContain('vitest run --project ui --passWithNoTests');
  });

  it('runs only the record readers, knowledge and Changesets for a spec-only change', () => {
    const checks = plan(['docs/specs/AST-030/spec.md']);
    expect(byId(checks, 'typecheck').skip).toBeTruthy();
    expect(byId(checks, 'build')).toBeUndefined();
    for (const id of ['vitest ui', 'vitest node'])
      expect(argvs(byId(checks, id))[0]).toContain('--spec-readers');
    expect(byId(checks, 'knowledge').skip).toBeUndefined();
    expect(byId(checks, 'changesets').skip).toBeUndefined();
  });

  it('runs the Lab tests and the guards for a Lab-only change', () => {
    const checks = plan(['packages/lab/src/Stat/Stat.tsx']);
    // CI's Lab lane typechecks Lab and the stories that import it.
    expect(argvs(byId(checks, 'build'))).toEqual(['pnpm build']);
    expect(argvs(byId(checks, 'typecheck'))).toEqual([
      'pnpm -F @astryxdesign/lab -F @astryxdesign/storybook typecheck',
    ]);
    const ui = argvs(byId(checks, 'vitest ui'));
    expect(ui[0]).toBe('pnpm test:ui --passWithNoTests packages/lab/');
    expect(ui[2]).toContain('--already-run');
  });

  it('runs every test when the module graph cannot scope the change', () => {
    const checks = plan(['vitest.config.mts']);
    expect(argvs(byId(checks, 'vitest ui'))).toEqual(['pnpm test:ui']);
    expect(argvs(byId(checks, 'vitest node'))).toEqual(['pnpm test:node']);
  });

  it('adds the Storybook build and the browser specs with --browser', () => {
    const checks = plan(['packages/core/src/Button/Button.tsx'], {
      browser: true,
      chromiumScope: '^packages/',
    });
    expect(checks.slice(-3).map(check => check.id)).toEqual([
      'storybook build',
      'a11y specs',
      'interaction specs',
    ]);
    const select = argvs(byId(checks, 'interaction specs'))[1];
    expect(select).toContain('select-chromium');
    expect(select).toContain('--scope ^packages/');
    expect(byId(checks, 'a11y specs').commands[0].env).toEqual({
      BASE_SHA: 'abc123',
    });
  });
});

describe('the formatting check', () => {
  it("passes Prettier only the TypeScript and Markdown files CI's step checks", () => {
    const lint = argvs(
      byId(
        plan([
          'packages/core/src/Button/Button.tsx',
          '.github/scripts/cli-smoke-test.mjs',
        ]),
        'lint',
      ),
    );
    expect(lint[1]).toBe(
      'pnpm exec prettier --check --ignore-unknown packages/core/src/Button/Button.tsx',
    );
  });

  it('skips it on the spec lane, as CI does', () => {
    const lint = argvs(byId(plan(['docs/specs/AST-030/spec.md']), 'lint'));
    expect(lint.join('\n')).not.toContain('prettier');
  });
});

describe('planChecks --quick', () => {
  it('checks the changed packages, files and tests alone', () => {
    const checks = plan(
      ['packages/core/src/Button/Button.tsx', 'scripts/preflight.test.mjs'],
      {quick: true},
    );
    expect(checks.map(check => check.id)).toEqual([
      'typecheck',
      'lint',
      'changed tests',
      'knowledge',
      'changesets',
    ]);
    const typecheck = argvs(byId(checks, 'typecheck'))[0];
    expect(typecheck).toContain('--filter [abc123]');
    expect(typecheck).not.toContain('...[');
    expect(argvs(byId(checks, 'changed tests'))).toEqual([
      'pnpm exec vitest run --passWithNoTests scripts/preflight.test.mjs',
    ]);
    expect(checks.flatMap(argvs).join('\n')).not.toMatch(
      /pnpm build|fs-guard-tests|--changed=|check:repo/,
    );
  });

  it('skips the tests when no test file changed, and ignores --browser', () => {
    const checks = plan(['packages/core/src/Button/Button.tsx'], {
      quick: true,
      browser: true,
    });
    expect(byId(checks, 'changed tests').skip).toBe('no changed test file');
    expect(byId(checks, 'interaction specs')).toBeUndefined();
  });

  it('says quick mode is not CI-equivalent', () => {
    const text = formatTable(
      [{id: 'lint', result: 'PASS', note: '', failed: null, seconds: 1}],
      {quick: true},
    );
    expect(text).toContain('run `pnpm preflight` before you flip');
    expect(text).toContain('not CI-equivalent');
    expect(text).not.toContain('ready to flip');
  });
});

describe('runChecks', () => {
  const ticks = () => {
    let t = 0;
    return () => (t += 1000);
  };

  it('fails a check at its failing command, names it, and runs the next check', () => {
    const ran = [];
    const rows = runChecks(
      [
        {
          id: 'a',
          commands: [
            {kind: 'light', argv: ['false']},
            {kind: 'light', argv: ['never']},
          ],
        },
        {id: 'b', commands: [{kind: 'light', argv: ['true']}]},
      ],
      {
        exec: argv => (ran.push(argv[0]), argv[0] === 'false' ? 2 : 0),
        now: ticks(),
      },
    );
    expect(ran).toEqual(['false', 'true']);
    expect(rows.map(row => [row.id, row.result, row.failed])).toEqual([
      ['a', 'FAIL', 'false'],
      ['b', 'PASS', null],
    ]);
  });

  it('wraps heavy steps only, with their kind', () => {
    const ran = [];
    runChecks(
      [
        {
          id: 'x',
          commands: [
            {kind: 'light', argv: ['pnpm', 'check:repo']},
            {kind: 'test', argv: ['pnpm', 'test:ui']},
          ],
        },
      ],
      {
        exec: argv => (ran.push(argv.join(' ')), 0),
        wrap: ['gate'],
        now: ticks(),
      },
    );
    expect(ran).toEqual(['pnpm check:repo', 'gate test pnpm test:ui']);
  });

  it('adds listed files as arguments, and passes without running when the list is empty', () => {
    const dir = tmp();
    const full = path.join(dir, 'full.txt');
    const empty = path.join(dir, 'empty.txt');
    fs.writeFileSync(full, 'a.test.ts\nb.test.ts\n');
    fs.writeFileSync(empty, '');
    const ran = [];
    const rows = runChecks(
      [
        {
          id: 'full',
          commands: [{kind: 'test', argv: ['vitest'], argsFrom: full}],
        },
        {
          id: 'empty',
          commands: [
            {
              kind: 'test',
              argv: ['vitest'],
              argsFrom: empty,
              emptyMeans: 'nothing reached',
            },
          ],
        },
      ],
      {exec: argv => (ran.push(argv.join(' ')), 0), now: ticks()},
    );
    expect(ran).toEqual(['vitest a.test.ts b.test.ts']);
    expect(rows[1]).toMatchObject({result: 'PASS', note: 'nothing reached'});
  });

  it('runs the whole Chromium suite for a full selection, and the named specs otherwise', () => {
    expect(chromiumSpecs('{"full": true, "reason": "x"}')).toBeNull();
    expect(chromiumSpecs('{"full": false, "specs": ["a.spec.ts"]}')).toEqual([
      'a.spec.ts',
    ]);
  });
});

describe('stopReason', () => {
  it("stops with exit 2 on uncommitted changes, which CI's listers would not see", () => {
    expect(
      stopReason({dirty: true, changes: 3, base: 'origin/main'}),
    ).toMatchObject({
      code: 2,
      message: expect.stringContaining('commit your changes first'),
    });
  });

  it('stops with exit 0 when nothing changed, and goes on otherwise', () => {
    expect(stopReason({dirty: false, changes: 0, base: 'origin/main'})).toEqual(
      {
        code: 0,
        message: 'No changes against origin/main.',
      },
    );
    expect(
      stopReason({dirty: false, changes: 1, base: 'origin/main'}),
    ).toBeNull();
  });
});

describe('formatTable', () => {
  it('ends "not ready: N" with each failing command, or "ready to flip"', () => {
    const fail = formatTable([
      {
        id: 'lint',
        result: 'FAIL',
        note: 'exit 1',
        failed: 'pnpm check:repo',
        seconds: 3,
      },
      {
        id: 'typecheck',
        result: 'SKIP',
        note: 'no build',
        failed: null,
        seconds: 0,
      },
    ]);
    expect(fail).toContain('  lint: pnpm check:repo');
    expect(fail).toContain('not ready: 1');
    expect(fail).toContain('a reviewer still judges the change');
    // A pass promises only the checks it ran.
    expect(fail).toContain(
      'CI can run more for this change than the checks above',
    );
    const pass = formatTable([
      {id: 'lint', result: 'PASS', note: '', failed: null, seconds: 3},
    ]);
    expect(pass).toContain('ready to flip');
    expect(pass).not.toContain('Failing commands');
  });
});

describe('chromiumScopeFromCi', () => {
  it("reads the Chromium selection step's scope from ci.yml", () => {
    const scope = chromiumScopeFromCi(
      fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'),
    );
    expect(scope).toMatch(/^\^\(internal\/interaction-harness\//);
    expect(() => new RegExp(scope)).not.toThrow();
  });
});
