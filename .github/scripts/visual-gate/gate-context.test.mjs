// Copyright (c) Meta Platforms, Inc. and affiliates.

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'gate.mjs',
);
const IDENTITY_ENV = [
  'ASTRYX_VISUAL_SHA',
  'ASTRYX_VISUAL_RUN_ID',
  'ASTRYX_VISUAL_RUN_ATTEMPT',
  'GITHUB_SHA',
  'GITHUB_RUN_ID',
  'GITHUB_RUN_ATTEMPT',
];

let root;
let plan;
let output;

function captureContext(overrides = {}) {
  const env = {...process.env};
  for (const name of IDENTITY_ENV) delete env[name];
  Object.assign(env, overrides);

  execFileSync(
    process.execPath,
    [SCRIPT, 'check', '--plan-file', plan, '--max-shots', '0', '--out', output],
    {env, encoding: 'utf8'},
  );
  return JSON.parse(fs.readFileSync(path.join(output, 'verdict.json'), 'utf8'))
    .context;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-gate-context-'));
  plan = path.join(root, 'plan.json');
  output = path.join(root, 'output');
  fs.writeFileSync(
    plan,
    JSON.stringify([
      {
        key: 'core-button--default__neutral-light',
        storyId: 'core-button--default',
        theme: 'neutral',
        mode: 'light',
        reasons: ['trusted:pr-scope'],
      },
    ]),
  );
});

afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

describe('stable release plan authority', () => {
  it('owns a closed Neutral and Probe baseline without preserving obsolete keys', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8');
    expect(source).toContain("const RELEASE_TIERS = ['surface', 'probe'];");
    expect(source).toContain('canonicalBaselineStories(');
    expect(source).not.toContain('shots = withBaselineCoverage(');
    expect(source).toContain('const baselineManifest = rawBaseline;');
    expect(source).toContain(
      'configuredLimit: releaseMode\n    ? config.visualPlanSafetyLimit',
    );
    expect(source).toContain(
      'readThemeCatalog(REPO_ROOT, config.baselineThemes)',
    );
  });
});

describe('empty visual plans', () => {
  it('refuses to capture a plan with no shots instead of reporting it clean', () => {
    fs.writeFileSync(plan, JSON.stringify([]));
    const result = spawnSync(
      process.execPath,
      [SCRIPT, 'check', '--plan-file', plan, '--out', output],
      {encoding: 'utf8'},
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /The exact trusted plan planned no shots;.*manual baseline workflow\./,
    );
    // The refusal comes before the shutter: nothing is captured, nothing is
    // compared, and there is no clean verdict for a reader to trust.
    expect(fs.existsSync(path.join(output, 'manifest.json'))).toBe(false);
    expect(fs.existsSync(path.join(output, 'verdict.json'))).toBe(false);
  });
});

describe('visual gate capture identity', () => {
  it('records the GitHub run identity by default', () => {
    expect(
      captureContext({
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_RUN_ID: '123',
        GITHUB_RUN_ATTEMPT: '2',
      }),
    ).toMatchObject({
      sha: 'a'.repeat(40),
      runId: '123',
      runAttempt: '2',
    });
  });

  it('records an explicit trusted recapture identity ahead of workflow defaults', () => {
    expect(
      captureContext({
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_RUN_ID: '999',
        GITHUB_RUN_ATTEMPT: '4',
        ASTRYX_VISUAL_SHA: 'b'.repeat(40),
        ASTRYX_VISUAL_RUN_ID: '123',
        ASTRYX_VISUAL_RUN_ATTEMPT: '2',
      }),
    ).toMatchObject({
      sha: 'b'.repeat(40),
      runId: '123',
      runAttempt: '2',
    });
  });

  it('rejects a max-shots flag without a value', () => {
    expect(() =>
      execFileSync(process.execPath, [SCRIPT, 'plan', '--max-shots'], {
        encoding: 'utf8',
      }),
    ).toThrow(/--max-shots requires a value/);
  });

  it('records missing identity as null', () => {
    expect(captureContext()).toMatchObject({
      sha: null,
      runId: null,
      runAttempt: null,
    });
  });

  it('preserves invalid explicit identity for downstream rejection', () => {
    expect(
      captureContext({
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_RUN_ID: '999',
        GITHUB_RUN_ATTEMPT: '4',
        ASTRYX_VISUAL_SHA: 'invalid',
        ASTRYX_VISUAL_RUN_ID: '',
        ASTRYX_VISUAL_RUN_ATTEMPT: 'invalid',
      }),
    ).toMatchObject({sha: 'invalid', runId: '', runAttempt: 'invalid'});
  });
});

// Each case spawns the gate on a 192-story index; a loaded CI runner can take
// longer than the default 30 s for the first, cold spawn.
describe(
  'component scope with reverse dependents (spec:AST-030 FR13)',
  {timeout: 120_000},
  () => {
    const repoRoot = path.resolve(path.dirname(SCRIPT), '../../..');
    const baselineDir = path.join(repoRoot, '.github/visual-baseline');
    let storybook;
    let folders;

    // A Storybook index of every baselined story, each tagged for every theme,
    // so the touched-plus-dependent scope can pass the focused budget.
    beforeEach(() => {
      storybook = path.join(root, 'storybook');
      fs.mkdirSync(storybook);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'),
      );
      const ids = [
        ...new Set(Object.keys(manifest.shots).map(key => key.split('__')[0])),
      ];
      const entries = {};
      for (const id of ids) {
        const folder = id.split('--')[0].replace(/^core-/, '');
        entries[id] = {
          type: 'story',
          id,
          title: `Core/${folder}`,
          name: id.split('--')[1],
          componentPath: `../../packages/core/src/${folder}/index.ts`,
          importPath: './stories/fixture.stories.tsx',
          tags: ['visual-baseline'],
        };
      }
      fs.writeFileSync(
        path.join(storybook, 'index.json'),
        JSON.stringify({v: 5, entries}),
      );
      folders = [
        ...new Set(Object.values(entries).map(entry => entry.title.slice(5))),
      ];
    });

    const gate = (command, ...args) =>
      spawnSync(
        process.execPath,
        [
          SCRIPT,
          command,
          '--storybook-dir',
          storybook,
          '--baseline',
          baselineDir,
          '--out',
          output,
          '--tiers',
          'component',
          '--no-scout',
          ...args,
        ],
        {encoding: 'utf8'},
      );
    const verdict = () =>
      JSON.parse(fs.readFileSync(path.join(output, 'verdict.json'), 'utf8'));

    it('writes the skipped verdict for an over-budget plan with reverse dependents, which the workflow answers with the whole plan', () => {
      const result = gate(
        'check',
        '--components',
        folders[0],
        '--dependents',
        folders.join(','),
      );
      expect(result.stderr).not.toMatch(/ReferenceError/);
      expect(result.status).toBe(0);
      expect(verdict().status).toBe('skipped');
    });

    it('writes the same skipped verdict for an over-budget plan of touched components alone', () => {
      const result = gate('check', '--components', folders.join(','));
      expect(result.status).toBe(0);
      expect(verdict().status).toBe('skipped');
    });

    it('plans the touched component and each dependent folder with a stable story, and reports the rest', () => {
      const touched = gate('plan', '--json', '--components', folders[0]);
      const scoped = gate(
        'plan',
        '--json',
        '--components',
        folders[0],
        '--dependents',
        `${folders[1]},nosuchfolder`,
      );
      expect(scoped.status).toBe(0);
      expect(scoped.stdout).toContain(
        'Reverse dependents with no stable story: nosuchfolder',
      );
      const planned = text => JSON.parse(text.slice(text.indexOf('[')));
      expect(planned(scoped.stdout).length).toBeGreaterThan(
        planned(touched.stdout).length,
      );
    });

    it('asks for the whole plan (exit 3) when nothing the scope reaches has a stable story', () => {
      const result = gate(
        'plan',
        '--components',
        '',
        '--dependents',
        'nosuchfolder',
      );
      expect(result.status).toBe(3);
    });
  },
);
