// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Routing contract for the touch interaction proofs in the broad CI lane.
 *
 * The proofs are coverage inside the shared surface (AST-030 FR11), so the
 * `test` join requires pr-interaction, and a failing proof fails `test` (FR7).
 * A Linux job decides whether the change touches the harness, a component,
 * Storybook, or the proofs' own setup; only then does pr-interaction take a
 * 4-core runner, and otherwise it passes on Linux without work. The proofs run
 * on the pull request's head: a head cut before they existed (no
 * playwright.interaction.config.ts) passes with a notice, and a pull request
 * that deletes the config still runs them, and fails.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const scope = ci.jobs['interaction-scope'];
const proofs = ci.jobs['pr-interaction'];
const step = (job, name) =>
  job.steps.find(candidate => candidate.name === name);
const decide = () => step(scope, 'Decide whether the interaction proofs apply');
const applies = "needs.interaction-scope.outputs.applies == 'true'";

const HEAD_SHA = 'fedcba9876543210fedcba9876543210fedcba98';
const CONFIG_PATTERN = '^playwright\\.interaction\\.config\\.ts$';

// Runs a step's script as Actions runs it (bash -eo pipefail) with a stub
// `git` first on PATH: fetching the base exits FETCH and fetching the head
// FETCH_HEAD; `show` prints a helper that answers HELPER, or TOUCHES for the
// config pattern (or fails when HELPER is 'missing'); `cat-file` finds the
// config in the head when HEAD_HAS_CONFIG. Returns the exit status and the
// outputs the script wrote.
function runStep(
  script,
  {
    env = {},
    fetch = 0,
    fetchHead = 0,
    helper = 0,
    touches = 1,
    headHasConfig = true,
  } = {},
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-interaction-'));
  try {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, 'git'),
      [
        '#!/usr/bin/env bash',
        'case "$1" in',
        `  fetch) case "$*" in *${HEAD_SHA}*) exit ${fetchHead} ;; *) exit ${fetch} ;; esac ;;`,
        helper === 'missing'
          ? '  show) exit 128 ;;'
          : `  show) printf '%s\\n' 'if [ "$2" = "${CONFIG_PATTERN}" ]; then exit ${touches}; fi' 'exit ${helper}' ;;`,
        `  cat-file) exit ${headHasConfig ? 0 : 1} ;;`,
        '  *) exit 3 ;;',
        'esac',
        '',
      ].join('\n'),
      {mode: 0o755},
    );
    const output = path.join(dir, 'output');
    fs.writeFileSync(output, '');
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script],
      {
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_OUTPUT: output,
          EVENT_NAME: 'pull_request',
          DOCSITE_ONLY: 'false',
          TOOLING_ONLY: 'false',
          BASE_SHA: '0123456789abcdef0123456789abcdef01234567',
          HEAD_SHA,
          ...env,
        },
      },
    );
    return {status: result.status, output: fs.readFileSync(output, 'utf8')};
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

describe('interaction proof routing', () => {
  it('is joined by test', () => {
    expect(ci.jobs.test.needs).toContain('pr-interaction');
    expect(
      step(ci.jobs.test, 'Require expected test-owner outcomes').env,
    ).toMatchObject({
      PR_INTERACTION_RESULT: '${{ needs.pr-interaction.result }}',
    });
  });

  it('always reports, so the join never reads a missing result', () => {
    expect(proofs.if).toBe(ci.jobs['test-native-swift'].if);
    expect(scope.if).toBe(ci.jobs['native-swift-scope'].if);
  });

  it('decides scope on Linux and takes four cores only when the proofs apply', () => {
    expect(scope['runs-on']).toBe('ubuntu-slim');
    expect(proofs.needs).toEqual([
      'check-scope',
      'interaction-scope',
      'build-storybook',
    ]);
    expect(proofs['runs-on']).toBe(
      "${{ needs.interaction-scope.outputs.applies == 'true' && '4-core-ubuntu' || 'ubuntu-slim' }}",
    );
    const guards = new Set([
      'Require a decided interaction scope',
      "Require this pull request's Storybook build",
      'Skip the proofs outside their scope',
    ]);
    for (const candidate of proofs.steps) {
      if (guards.has(candidate.name)) continue;
      expect(candidate.if, candidate.name ?? candidate.uses).toMatch(
        new RegExp(
          `^(always\\(\\) && )?${applies.replace(/[.()|]/g, '\\$&')}$`,
        ),
      );
    }
  });

  it('fails closed when the scope cannot be decided or Storybook did not build', () => {
    expect(step(scope, 'Require successful scope classification').if).toBe(
      "needs.check-scope.result != 'success'",
    );
    expect(step(proofs, 'Require a decided interaction scope').if).toBe(
      "needs.interaction-scope.result != 'success'",
    );
    expect(step(proofs, "Require this pull request's Storybook build").if).toBe(
      `${applies} && needs.build-storybook.result != 'success'`,
    );
    expect(decide().run).toContain(
      'git show "$BASE_SHA:.github/scripts/pr-scope-touches.sh"',
    );
    // Only "out of scope" (exit 1) skips; unknown (2) runs the proofs.
    expect(decide().run).toContain('if [ "$scope" = 1 ]; then');
  });

  // AST-030 FR9: removing a fail-closed edge fails a test. Only a helper that
  // answers "out of scope" (exit 1) skips the proofs; an unknown answer, a
  // failed fetch, a helper missing at the base, or no base runs them.
  it('runs the proofs unless the helper answers "out of scope"', () => {
    const decided = options => runStep(decide().run, options);
    for (const [label, options, expected] of [
      ['in scope (helper exit 0)', {helper: 0}, 'true'],
      ['out of scope (helper exit 1)', {helper: 1}, 'false'],
      ['unknown (helper exit 2)', {helper: 2}, 'true'],
      ['the base cannot be fetched', {fetch: 1}, 'true'],
      ['the helper is missing at the base', {helper: 'missing'}, 'true'],
      ['no base SHA', {env: {BASE_SHA: ''}}, 'true'],
      ['docsite only', {env: {DOCSITE_ONLY: 'true'}, helper: 0}, 'false'],
      [
        'not a pull request',
        {env: {EVENT_NAME: 'merge_group'}, helper: 0},
        'false',
      ],
    ]) {
      const {status, output} = decided(options);
      expect(status, label).toBe(0);
      expect(output, label).toBe(`applies=${expected}\n`);
    }
  });

  it('passes a head cut before the proofs existed, and still fails one that deletes their config', () => {
    const decided = options => runStep(decide().run, options);
    for (const [label, options, expected] of [
      ['the head has the config', {headHasConfig: true}, 'true'],
      [
        'the branch predates the proofs (no config, not changed by the PR)',
        {headHasConfig: false, touches: 1},
        'false',
      ],
      [
        'the pull request deletes the config',
        {headHasConfig: false, touches: 0},
        'true',
      ],
      [
        'whether the PR changes the config is unknown',
        {headHasConfig: false, touches: 2},
        'true',
      ],
      [
        'the head cannot be fetched',
        {headHasConfig: false, touches: 1, fetchHead: 1},
        'true',
      ],
      [
        'no head SHA',
        {headHasConfig: false, touches: 1, env: {HEAD_SHA: ''}},
        'true',
      ],
      [
        'the scope itself is unknown',
        {headHasConfig: false, touches: 1, helper: 2},
        'true',
      ],
    ]) {
      const {status, output} = decided(options);
      expect(status, label).toBe(0);
      expect(output, label).toBe(`applies=${expected}\n`);
    }
    expect(decide().run).toContain(
      '::notice title=Interaction proofs predate this branch::',
    );
  });

  it('fails each guard step when it runs', () => {
    for (const [job, name] of [
      [scope, 'Require successful scope classification'],
      [proofs, 'Require a decided interaction scope'],
      [proofs, "Require this pull request's Storybook build"],
    ]) {
      expect(runStep(step(job, name).run).status, name).toBe(1);
    }
  });

  it('keeps the harness, components, Storybook and its own setup in scope', () => {
    const pattern = new RegExp(
      decide().run.match(/bash "\$helper" "\$BASE_SHA" '([^']+)'/)[1],
    );
    for (const touched of [
      'internal/interaction-harness/src/scripts.ts',
      'internal/a11y-spec/src/storybook.ts',
      'playwright.interaction.config.ts',
      'packages/core/src/BottomSheet/BottomSheet.tsx',
      'apps/storybook/.storybook/preview.tsx',
      '.github/workflows/ci.yml',
      'package.json',
      'pnpm-lock.yaml',
    ]) {
      expect(pattern.test(touched), touched).toBe(true);
    }
    for (const untouched of [
      'docs/specs/AST-030/spec.md',
      'apps/docsite/src/app/page.tsx',
      'packages/core/package.json',
      '.github/scripts/native-swift.sh',
    ]) {
      expect(pattern.test(untouched), untouched).toBe(false);
    }
  });

  it('passes without work on docsite-only, tooling-only and merge-group runs', () => {
    expect(decide().env).toMatchObject({
      HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
      EVENT_NAME: '${{ github.event_name }}',
      DOCSITE_ONLY: '${{ needs.check-scope.outputs.docsite_only }}',
      TOOLING_ONLY: '${{ needs.check-scope.outputs.tooling_only }}',
    });
    expect(decide().run).toContain(
      'if [ "$DOCSITE_ONLY" = true ] || [ "$TOOLING_ONLY" = true ]; then',
    );
    expect(decide().run).toContain(
      'if [ "$EVENT_NAME" != pull_request ]; then',
    );
  });
});
