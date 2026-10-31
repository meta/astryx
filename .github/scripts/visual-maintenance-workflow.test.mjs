// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Baseline maintenance workflow ownership contracts.
 * @input ci.yml and independent PR/dispatch states
 * @output Routing, trust-boundary, and artifact retention regression checks
 * @position Node contracts for the shared visual owner, not another CI lane
 */

import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import {ungated} from './ci-pr-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const visual = workflow.jobs['pr-visual'];
const step = (job, name) =>
  job.steps.find(candidate => candidate.name === name);

// Only trusted workflow expressions are evaluated. The fixtures below provide
// outcomes independently, including skipped dependencies on maintenance dispatch.
function runs(
  job,
  {
    event = 'workflow_dispatch',
    operation = 'capture',
    needs = {},
    cancelled = false,
    labels = [],
  } = {},
) {
  // The pull-request gate in front is ci-pr-gate.test.mjs's to prove.
  const expression = ungated(job.if ?? 'true')
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/needs\.([a-z][a-z0-9-]*)/g, 'needs["$1"]')
    // GitHub's object filter: `labels.*.name` lists the labels' names.
    .replace(
      /contains\(github\.event\.pull_request\.labels\.\*\.name, '([^']+)'\)/g,
      "(github.event.pull_request?.labels ?? []).some(label => label.name === '$1')",
    );
  if (!/\b(always|cancelled|success|failure)\(/.test(expression)) {
    if (
      cancelled ||
      Object.values(needs).some(value => value.result !== 'success')
    )
      return false;
  }
  return Function(
    'github',
    'inputs',
    'needs',
    'always',
    'cancelled',
    `return Boolean(${expression});`,
  )(
    {
      event_name: event,
      event: {pull_request: {labels: labels.map(name => ({name}))}},
    },
    {operation},
    needs,
    () => true,
    () => cancelled,
  );
}

function dependencies(job, result = 'success') {
  const names = Array.isArray(job.needs)
    ? job.needs
    : job.needs
      ? [job.needs]
      : [];
  return Object.fromEntries(
    names.map(name => [
      name,
      {
        result,
        outputs: {has_stable_visual: 'true', has_components: 'true'},
      },
    ]),
  );
}

describe('CI baseline maintenance routing', () => {
  it('has explicit capture/release dispatch without a new workflow or test owner', () => {
    expect(workflow.on.workflow_dispatch.inputs.operation.options).toEqual([
      'capture',
      'release-check',
    ]);
    expect(visual.name).toBe('Stable visual regression');
    expect(visual['runs-on']).toContain(
      "'2-core-ubuntu-arm' || 'ubuntu-24.04-arm'",
    );
    expect(workflow.jobs).not.toHaveProperty('baseline-publication');
    expect(workflow.on).not.toHaveProperty('schedule');
  });

  it('does not run non-maintenance CI jobs for capture', () => {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      if (['maintenance-request', 'pr-visual'].includes(name)) continue;
      expect(
        runs(job, {operation: 'capture', needs: dependencies(job)}),
        name,
      ).toBe(false);
    }
  });

  it('runs capture despite skipped PR dependencies, only after the main guard succeeds', () => {
    const needs = dependencies(visual, 'skipped');
    needs['maintenance-request'].result = 'success';
    expect(runs(visual, {needs})).toBe(true);
    needs['maintenance-request'].result = 'failure';
    expect(runs(visual, {needs})).toBe(false);
  });

  it('runs on an opted-in pull request when the maintenance guard is skipped', () => {
    const needs = dependencies(visual);
    needs['maintenance-request'].result = 'skipped';
    const optedIn = {event: 'pull_request', needs, labels: ['ci:heavy-lanes']};
    // The job decides its stable visual scope in its own steps.
    expect(runs(visual, optedIn)).toBe(true);
    // Without the opt-in label a pull request update runs no visual owner.
    expect(runs(visual, {event: 'pull_request', needs})).toBe(false);
    needs['build-storybook'].result = 'failure';
    expect(runs(visual, optedIn)).toBe(false);
    expect(runs(visual, {event: 'merge_group', needs})).toBe(false);
  });

  it.each([
    ['refs/heads/main', 0],
    ['refs/heads/feature', 1],
    ['refs/tags/main', 1],
  ])('guards maintenance ref %s before checkout', (ref, expected) => {
    const guard = workflow.jobs['maintenance-request'];
    expect(guard.steps).toHaveLength(1);
    const result = spawnSync('bash', ['-c', guard.steps[0].run], {
      env: {...process.env, GITHUB_REF: ref},
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(expected);
  });

  it('isolates dispatch concurrency from PRs and does not cancel queued maintenance', () => {
    expect(workflow.concurrency.group).toContain('|| github.run_id');
    expect(workflow.concurrency['cancel-in-progress']).toBe(
      "${{ github.event_name != 'workflow_dispatch' }}",
    );
  });
});

describe('canonical capture and checked-in baseline separation', () => {
  it('builds full maintenance Storybook only inside the existing visual owner', () => {
    const build = step(visual, 'Build canonical maintenance Storybook');
    expect(build.if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.operation == 'capture'",
    );
    expect(build.run).toBe(
      'pnpm build && pnpm -F @astryxdesign/storybook build',
    );
    const capture = step(visual, 'Capture canonical visual baseline');
    expect(capture.if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.operation == 'capture'",
    );
    expect(capture.run).toContain('gate.mjs release');
    expect(capture.run).not.toMatch(
      /--(?:sample|only|components|themes|max-shots|tiers)\b/,
    );
    expect(visual.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    });
  });

  it('keeps browser-refresh capture reachable, but only uploads validated full captures', () => {
    expect(
      step(visual, 'Capture canonical visual baseline')['continue-on-error'],
    ).toBe(true);
    const validation = step(visual, 'Validate canonical baseline capture');
    expect(validation.if).toContain('always()');
    expect(validation.run).toContain('validateVisualMaintenanceCapture');
    expect(validation.env.CAPTURE_SHA).toBe('${{ github.sha }}');
    expect(validation.env.CAPTURE_RUN_ATTEMPT).toBe(
      '${{ github.run_attempt }}',
    );
    const artifact = step(visual, 'Upload canonical baseline candidate');
    expect(artifact.if).toContain(
      "steps.maintenance-validation.outcome == 'success'",
    );
    expect(artifact.with.name).toBe(
      'visual-baseline-capture-${{ github.run_id }}-${{ github.run_attempt }}',
    );
    expect(artifact.with.path).toContain('.visual-run/shots/');
    expect(artifact.with.path).toContain('.visual-run/manifest.json');
    expect(artifact.with.path).toContain('.visual-run/verdict.json');
  });

  it('uses the checked-in baseline for every comparison', () => {
    const commands = visual.steps.map(item => item.run ?? '').join('\n');
    expect(commands).toContain('--baseline .github/visual-baseline');
    expect(commands).not.toContain('gh-pages');
    expect(workflow.jobs).not.toHaveProperty('baseline-publication');
  });

  it.each([
    ['focused component', 'Button', '', 'false', 'check', 'pass'],
    ['focused theme', '', 'stone', 'false', 'check', 'pass'],
    ['mixed broad and component', 'Button', '', 'true', 'release', 'pass'],
    ['broad without components', '', '', 'true', 'release', 'pass'],
    ['over-budget focused plan', 'Button', '', 'false', 'check', 'skipped'],
  ])(
    'keeps %s in the canonical visual job',
    (_label, components, themes, broad, command, status) => {
      const script = step(
        visual,
        'Run the visual gate for the touched components',
      ).run;
      const result = spawnSync(
        'bash',
        [
          '-c',
          `
      jq() {
        case "$2" in
          *changedStableThemes*) printf '%s' "$TEST_THEMES" ;;
          *newComponents*) printf '%s' "$TEST_COMPONENTS" ;;
          *) printf '%s' "$TEST_STATUS" ;;
        esac
      }
      node() {
        printf 'gate-command:%s\\n' "$2"
        if [ "$2" = 'release' ]; then TEST_STATUS=pass; fi
      }
      ${script}
    `,
        ],
        {
          env: {
            ...process.env,
            TEST_COMPONENTS: components,
            TEST_THEMES: themes,
            BROAD_STABLE_VISUAL: broad,
            TEST_STATUS: status,
            GITHUB_STEP_SUMMARY: '/dev/null',
          },
          encoding: 'utf8',
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`gate-command:${command}`);
      if (status === 'skipped') {
        expect(result.stdout).toContain('gate-command:release');
      }
      expect(visual['continue-on-error']).toBeUndefined();
    },
  );

  it.each([
    [1, 'failed', 1],
    [2, 'changed', 0],
    [0, 'skipped', 1],
  ])(
    'handles gate exit %s and final verdict %s without hiding incomplete evidence',
    (code, status, expected) => {
      const script = step(
        visual,
        'Run the visual gate for the touched components',
      ).run;
      const result = spawnSync(
        'bash',
        [
          '-c',
          `
      jq() {
        case "$2" in
          *changedStableThemes*) printf '' ;;
          *newComponents*) printf 'Button' ;;
          *) printf '%s' "$TEST_STATUS" ;;
        esac
      }
      node() { return "$TEST_CODE"; }
      ${script}
    `,
        ],
        {
          env: {
            ...process.env,
            TEST_CODE: String(code),
            TEST_STATUS: status,
            BROAD_STABLE_VISUAL: 'false',
            GITHUB_STEP_SUMMARY: '/dev/null',
          },
          encoding: 'utf8',
        },
      );
      expect(result.status, result.stderr).toBe(expected);
    },
  );
});
