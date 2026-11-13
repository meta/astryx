// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * build-storybook finds the pull request's merge base once, deep enough for a
 * branch far behind main, and fails by name when it cannot; the API change
 * report reads that same merge base instead of searching again.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const root = path.resolve(import.meta.dirname, '../..');
const ci = yaml.parse(
  fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'),
);
const steps = ci.jobs['build-storybook'].steps;
const find = steps.find(step => step.id === 'merge-base');
const report = steps.find(step => step.name === 'Report API changes');

describe("build-storybook's merge base", () => {
  it('is searched up to five times 200 commits deep', () => {
    expect(find.run).toMatch(
      /merge-base\.sh "\$BASE_REF" 'the size comparisons' 5\b/,
    );
  });

  it('fails the job by name when it is not within reach', () => {
    expect(find.run).toMatch(/::error::Merge base not within 1000 commits/);
    expect(find.run).toMatch(/exit 1/);
    expect(find['continue-on-error']).toBeUndefined();
  });

  it('is the one the API change report compares with', () => {
    expect(report.env.BASE_SHA).toBe('${{ steps.merge-base.outputs.sha }}');
    expect(report.run).not.toContain('merge-base.sh');
  });
});
