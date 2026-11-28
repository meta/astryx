// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: the platform-only workflow
 *   (.github/workflows/platform-only-tests.yml) runs each Node test file whose
 *   case only Windows or macOS can run, on that system, daily and by hand,
 *   with its own config (.github/scripts/vitest.platform-only.config.mjs).
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';
import config, {PLATFORM_ONLY} from './vitest.platform-only.config.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.parse(
  fs.readFileSync(
    path.join(root, '.github/workflows/platform-only-tests.yml'),
    'utf8',
  ),
);
const job = workflow.jobs['platform-only'];
const report = workflow.jobs.report;

describe('platform-only workflow', () => {
  it('runs daily and by hand, never on a pull request or a push', () => {
    expect(Object.keys(workflow.on).sort()).toEqual([
      'schedule',
      'workflow_dispatch',
    ]);
  });

  it('lets only the report job write, and only issues', () => {
    expect(workflow.permissions).toEqual({});
    expect(job.permissions).toEqual({contents: 'read'});
    expect(report.permissions).toEqual({
      actions: 'read',
      contents: 'read',
      issues: 'write',
    });
  });

  it('reports every scheduled outcome but a cancel, after both legs', () => {
    expect(report.needs).toBe('platform-only');
    expect(report.if).toBe(
      "always() && !cancelled() && github.event_name == 'schedule'",
    );
  });

  it("checks out every module the report job's script loads", () => {
    const listed = report.steps[0].with['sparse-checkout'];
    const imports = [];
    const visit = file => {
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      for (const [, spec] of text.matchAll(/from '(\.\.?\/[^']+)'/g)) {
        const next = path.posix.normalize(
          path.posix.join(path.posix.dirname(file), spec),
        );
        if (!imports.includes(next)) {
          imports.push(next);
          visit(next);
        }
      }
    };
    visit('.github/scripts/platform-only-report.mjs');
    for (const file of ['.github/scripts/platform-only-report.mjs', ...imports])
      expect(listed, file).toContain(file);
  });

  it("gives each leg the config's file and case, on its system", () => {
    expect(job.strategy.matrix.include).toEqual(PLATFORM_ONLY);
    expect(job['runs-on']).toBe('${{ matrix.os }}');
  });

  it('names a case that exists in each file', () => {
    for (const entry of PLATFORM_ONLY) {
      const source = fs.readFileSync(path.join(root, entry.file), 'utf8');
      expect(source, entry.file).toContain(`'${entry.case}'`);
    }
  });

  it('runs the files with no global setup and no workspace projects', () => {
    expect(config.test?.include).toEqual(PLATFORM_ONLY.map(e => e.file));
    expect(config.test?.globalSetup).toBeUndefined();
    expect(config.test?.setupFiles).toBeUndefined();
    expect(config.test?.projects).toBeUndefined();
    const run = job.steps.find(step => step.name === 'Run the file').run;
    expect(run).toContain(
      '--config .github/scripts/vitest.platform-only.config.mjs',
    );
  });
});
