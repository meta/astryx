// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Routing contract for the native Swift packages.
 *
 * `test` requires test-native-swift. A runner must be picked before its job
 * starts, so native-swift-runner, a seconds-long job on a free slim runner,
 * runs the same scope step as every test job; test-native-swift takes macOS
 * only when native Swift changed, and otherwise passes on Linux without work.
 * It is the one job that exists only to decide scope, because only it picks a
 * runner.
 */

import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {ungated} from './ci-pr-gate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const runner = ci.jobs['native-swift-runner'];
const swift = ci.jobs['test-native-swift'];
const step = (job, name) =>
  job.steps.find(candidate => candidate.name === name);
const applies = "needs.native-swift-runner.outputs.applies == 'true'";

describe('native Swift routing', () => {
  it('runs the macOS build on a merge-queue entry, where there is no PR file list', () => {
    const scope = runner.steps.find(candidate => candidate.id === 'scope');
    const action = yaml.parse(
      fs.readFileSync(
        path.join(root, '.github/actions/test-scope/action.yml'),
        'utf8',
      ),
    );
    const outside =
      scope.with?.['outside-pull-request'] ??
      action.inputs['outside-pull-request'].default;
    expect(outside).toBe('run');
  });

  it('is joined by test', () => {
    expect(ci.jobs.test.needs).toContain('test-native-swift');
    expect(
      step(ci.jobs.test, 'Require expected test-owner outcomes').env,
    ).toMatchObject({
      TEST_NATIVE_SWIFT_RESULT: '${{ needs.test-native-swift.result }}',
    });
  });

  it('decides on Linux and asks for macOS only when Swift changed', () => {
    expect(runner['runs-on']).toBe('ubuntu-slim');
    expect(runner.outputs.applies).toBe('${{ steps.scope.outputs.applies }}');
    expect(runner.steps.find(s => s.id === 'scope').uses).toBe(
      './.test-scope/.github/actions/test-scope',
    );
    expect(swift.needs).toEqual(['native-swift-runner']);
    expect(swift['runs-on']).toBe(
      `\${{ ${applies} && 'macos-15' || 'ubuntu-slim' }}`,
    );
    // Behind the pull-request gate (spec:AST-030 FR17).
    expect(swift.if).toMatch(/^\$\{\{ \(github\.event_name != 'pull_request'/);
    expect(ungated(swift.if)).toBe(
      "github.event_name != 'workflow_dispatch' && always() && !cancelled()",
    );
  });

  it('fails closed when the runner cannot be decided', () => {
    expect(step(swift, 'Require a decided Swift runner').if).toBe(
      "needs.native-swift-runner.result != 'success'",
    );
    for (const candidate of swift.steps) {
      if (
        [
          'Require a decided Swift runner',
          'Skip Swift work outside its scope',
        ].includes(candidate.name)
      ) {
        continue;
      }
      expect(candidate.if, candidate.name ?? candidate.uses).toBe(applies);
    }
  });

  it('keeps its own steps in scope, so changing them runs them', () => {
    expect(step(swift, 'Build and test each native Swift package').run).toBe(
      'bash .github/scripts/native-swift.sh',
    );
    const pattern = new RegExp(
      runner.steps.find(s => s.id === 'scope').with.paths,
    );
    for (const touched of [
      '.github/scripts/native-swift.sh',
      'packages/native/apple/Package.swift',
      'packages/native/swift-ios-1/core/Button/AstryxButton.swift',
      '.github/actions/test-scope/action.yml',
    ]) {
      expect(pattern.test(touched), touched).toBe(true);
    }
    for (const untouched of [
      '.github/workflows/ci.yml',
      'packages/native/src/index.ts',
      'packages/core/src/Button/Button.tsx',
    ]) {
      expect(pattern.test(untouched), untouched).toBe(false);
    }
  });
});
