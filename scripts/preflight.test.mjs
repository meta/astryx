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
import {afterAll, describe, expect, it} from 'vitest';
import {
  chromiumScopeFromCi,
  chromiumSpecs,
  classify,
  formatTable,
  missingBuilds,
  planChecks,
  runChecks,
  stopReason,
  workspaceExports,
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

describe('the interaction specs step', () => {
  // Playwright's --project takes every value after it, so the selected
  // spec files go before it.
  const run = selection => {
    const dir = tmp();
    const checks = planChecks({
      scope: classify([change('packages/core/src/Button/Button.tsx')]),
      mergeBase: 'abc123',
      changed: ['packages/core/src/Button/Button.tsx'],
      browser: true,
      tmp: dir,
      chromiumScope: '^packages/',
    });
    const step = byId(checks, 'interaction specs');
    const ran = [];
    runChecks([step], {
      exec: (argv, {stdout}) => {
        if (argv.includes('select-chromium'))
          fs.writeFileSync(argv[argv.indexOf('--out') + 1], selection);
        ran.push(argv.join(' '));
        if (stdout) fs.writeFileSync(stdout, '');
        return 0;
      },
      now: () => 0,
    });
    return ran.at(-1);
  };

  it('passes the selected specs before --project chromium', () => {
    expect(run('{"full": false, "specs": ["a.spec.ts", "b.spec.ts"]}')).toBe(
      'pnpm test:interaction a.spec.ts b.spec.ts --project chromium',
    );
  });

  it('runs every Chromium spec when the selection is full', () => {
    expect(run('{"full": true, "reason": "shared"}')).toBe(
      'pnpm test:interaction --project chromium',
    );
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

describe('--quick with workspace builds missing', () => {
  // A workspace with nothing built, so the answers do not depend on whether
  // this checkout ran `pnpm build`.
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-unbuilt-'));
  const put = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(fixture, file)), {recursive: true});
    fs.writeFileSync(path.join(fixture, file), text);
  };
  put(
    'pnpm-workspace.yaml',
    "packages:\n  - 'packages/*'\n  - 'packages/themes/*'\n  - 'internal/*'\n",
  );
  const pkg = (dir, name, exports) =>
    put(`${dir}/package.json`, JSON.stringify({name, exports}));
  pkg('packages/core', '@astryxdesign/core', {
    '.': {types: './dist/index.d.ts'},
    './utils': {types: './dist/utils/index.d.ts'},
    './theme/tokens.stylex': {types: './dist/theme/tokens.stylex.d.ts'},
  });
  pkg('packages/lab', '@astryxdesign/lab', {'.': {types: './dist/index.d.ts'}});
  pkg('packages/themes/neutral', '@astryxdesign/theme-neutral', {
    './built': {types: './dist/neutral.d.ts'},
  });
  pkg('internal/a11y-spec', '@astryxdesign/a11y-spec', {'.': './src/index.ts'});
  put('internal/a11y-spec/src/index.ts', '');
  const declares = workspaceExports(fixture);
  /** @param {string} text */
  const unbuilt = text => missingBuilds(text, {declares});
  afterAll(() => fs.rmSync(fixture, {recursive: true, force: true}));

  const missing = [
    "assets/templates/pages/a/page.tsx(9,28): error TS2307: Cannot find module '@astryxdesign/theme-neutral/built' or its corresponding type declarations.",
    "src/x.ts(1,1): error TS2307: Cannot find module '../../core/dist/index.js' or its corresponding type declarations.",
  ].join('\n');
  const real = `${missing}\nsrc/y.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.`;

  it('names missing builds only when every error is a missing build output', () => {
    expect(unbuilt(missing)).toBe(
      'skipped, workspace builds missing; run `pnpm build` first',
    );
    expect(unbuilt(real)).toBeNull();
    expect(unbuilt('no errors here')).toBeNull();
    expect(
      unbuilt(
        "a.ts(1,1): error TS2307: Cannot find module 'left-pad' or its corresponding type declarations.",
      ),
    ).toBeNull();
    // A third-party package's dist path is not a workspace build.
    expect(
      unbuilt(
        "a.ts(1,1): error TS2307: Cannot find module 'next/dist/shared/lib/image-config' or its corresponding type declarations.",
      ),
    ).toBeNull();
    // A relative path into a workspace package's dist is, at any depth.
    for (const specifier of [
      '../../packages/core/dist/index.js',
      '../dist/index.js',
      './dist/index.js',
    ])
      expect(
        unbuilt(
          `a.ts(1,1): error TS2307: Cannot find module '${specifier}' or its corresponding type declarations.`,
        ),
        specifier,
      ).toBe('skipped, workspace builds missing; run `pnpm build` first');
  });

  const SKIPPED = 'skipped, workspace builds missing; run `pnpm build` first';
  const unresolved = (file, specifier) =>
    `${file}(1,1): error TS2307: Cannot find module '${specifier}' or its corresponding type declarations.`;
  const implicitAny = (file, code = 'TS7006') =>
    `${file}(2,3): error ${code}: Parameter 'v' implicitly has an 'any' type.`;

  it('counts any unresolved workspace package import as a missing build, bare or by subpath', () => {
    for (const specifier of [
      '@astryxdesign/lab',
      '@astryxdesign/core',
      '@astryxdesign/core/utils',
      '@astryxdesign/core/theme/tokens.stylex',
    ])
      expect(unbuilt(unresolved('src/a.ts', specifier)), specifier).toBe(
        SKIPPED,
      );
    // A package outside the workspace scope is still a real error.
    expect(unbuilt(unresolved('src/a.ts', '@astryx/other'))).toBeNull();
  });

  it('still fails on a workspace subpath no package exports, or an unknown package', () => {
    // A typo that a build never fixes.
    expect(
      unbuilt(unresolved('src/a.ts', '@astryxdesign/core/utilz')),
    ).toBeNull();
    expect(
      unbuilt(unresolved('src/a.ts', '@astryxdesign/no-such-package')),
    ).toBeNull();
  });

  it('counts a declared entry only while the file it names for types is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-exports-'));
    const write = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
      fs.writeFileSync(path.join(root, file), text);
    };
    try {
      write('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
      write(
        'packages/core/package.json',
        JSON.stringify({
          name: '@astryxdesign/core',
          exports: {
            '.': {types: './dist/index.d.ts', default: './dist/index.js'},
            './utils': {
              import: {types: './dist/utils.d.ts', default: './dist/utils.js'},
            },
            './locales/*.json': './locales/*.json',
            './source': './src/index.ts',
          },
        }),
      );
      write('packages/core/src/index.ts', '');
      write('packages/core/locales/en.json', '{}');
      let declares = workspaceExports(root);
      expect(declares('@astryxdesign/core')).toBe(true);
      expect(declares('@astryxdesign/core/utils')).toBe(true);
      expect(declares('@astryxdesign/core/locales/pseudo.json')).toBe(true);
      // The file exists, so a build cannot be what is missing.
      expect(declares('@astryxdesign/core/locales/en.json')).toBe(false);
      expect(declares('@astryxdesign/core/source')).toBe(false);
      expect(declares('@astryxdesign/core/utilz')).toBe(false);
      expect(declares('@astryxdesign/no-such-package')).toBe(false);
      write('packages/core/dist/index.d.ts', '');
      declares = workspaceExports(root);
      expect(declares('@astryxdesign/core')).toBe(false);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('still fails on an import of a workspace package whose entry files exist', () => {
    // a11y-spec's entries are source files, so no build clears this error; it
    // is an import from a package the importer does not depend on.
    expect(
      unbuilt(
        [
          unresolved('src/Chart/a.ts', '@astryxdesign/a11y-spec'),
          implicitAny('src/Chart/a.ts'),
        ].join('\n'),
      ),
    ).toBeNull();
    // An injected reader decides alone.
    expect(
      missingBuilds(unresolved('src/a.ts', '@astryxdesign/core/utilz'), {
        declares: () => true,
      }),
    ).toBe(SKIPPED);
  });

  it('treats implicit-any errors in a file with an unresolved workspace import as follow-ons', () => {
    expect(
      unbuilt(
        [
          unresolved('src/Chart/webgl.ts', '@astryxdesign/core/utils'),
          implicitAny('src/Chart/webgl.ts'),
          implicitAny('src/Chart/webgl.ts', 'TS7031'),
        ].join('\n'),
      ),
    ).toBe(SKIPPED);
  });

  it('still fails on an implicit-any error in a file with no unresolved workspace import', () => {
    expect(
      unbuilt(
        [
          unresolved('src/Chart/webgl.ts', '@astryxdesign/core/utils'),
          implicitAny('src/Other/other.ts'),
        ].join('\n'),
      ),
    ).toBeNull();
    expect(unbuilt(implicitAny('src/Other/other.ts'))).toBeNull();
  });

  it('still fails on any other error beside the unresolved imports', () => {
    expect(
      unbuilt(
        [
          unresolved('src/a.ts', '@astryxdesign/lab'),
          "src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.",
        ].join('\n'),
      ),
    ).toBeNull();
  });

  it('plans the quick typecheck to keep its output and judge it', () => {
    const typecheck = byId(
      plan(['packages/core/src/Button/Button.tsx'], {quick: true}),
      'typecheck',
    ).commands[0];
    expect(typecheck.tee).toBe(true);
    expect(typecheck.stdout).toMatch(/typecheck\.log$/);
    expect(typecheck.skipWhen).toBe(missingBuilds);
  });

  it('reports a SKIP, not a failure, and the verdict does not count it', () => {
    const dir = tmp();
    const log = path.join(dir, 'typecheck.log');
    const check = text => [
      {
        id: 'typecheck',
        commands: [
          {
            kind: 'build',
            argv: ['tsc'],
            stdout: log,
            tee: true,
            skipWhen: unbuilt,
          },
        ],
      },
    ];
    const exec = text => () => (fs.writeFileSync(log, text), 2);
    const [skipped] = runChecks(check(), {exec: exec(missing), now: () => 0});
    expect(skipped).toMatchObject({
      result: 'SKIP',
      note: 'skipped, workspace builds missing; run `pnpm build` first',
      failed: null,
    });
    const verdict = formatTable([skipped], {quick: true});
    expect(verdict).not.toContain('not ready');
    // A skipped typecheck checked nothing: the verdict says so, never a pass.
    expect(verdict).toContain(
      'not checked: typecheck (workspace builds missing); run `pnpm build`, then run again before you flip',
    );
    expect(verdict).not.toContain('quick checks pass');
    const [failed] = runChecks(check(), {exec: exec(real), now: () => 0});
    expect(failed).toMatchObject({result: 'FAIL', failed: 'tsc'});
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
