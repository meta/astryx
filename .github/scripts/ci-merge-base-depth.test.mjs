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
const skipNote = steps.find(
  step => step.name === 'Interaction check: skip the merge-base comparisons',
);
const job = ci.jobs['build-storybook'];

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

  describe('for a release interaction check against its throwaway base', () => {
    it('is the check that targets release/interaction-check-base from an interaction-check/ branch here, by the release account', () => {
      expect(job.env.INTERACTION_CHECK_BASE).toBe(
        "${{ github.base_ref == 'release/interaction-check-base' && startsWith(github.head_ref, 'interaction-check/') && github.event.pull_request.user.login == 'cixzhang' && github.event.pull_request.head.repo.full_name == github.repository }}",
      );
    });

    it('is not searched, so it cannot fail the job, and a step says by name what is skipped', () => {
      expect(find.if).toContain("env.INTERACTION_CHECK_BASE != 'true'");
      expect(skipNote.if).toContain("env.INTERACTION_CHECK_BASE == 'true'");
      expect(steps.indexOf(skipNote)).toBe(steps.indexOf(find) - 1);
      expect(skipNote.run).toContain('::notice title=Interaction check::');
      expect(skipNote.run).toContain(
        "main's size records, the merge-base build and the API changes",
      );
    });

    it('skips every step that reads the merge base, and the API report ends without one', () => {
      for (const id of ['size-records', 'base-build']) {
        expect(steps.find(step => step.id === id).if).toContain(
          "steps.merge-base.outputs.sha != ''",
        );
      }
      expect(report.run).toContain('[ -n "$BASE_SHA" ] || exit 0');
    });

    it('leaves every other pull request failing by name without a merge base', () => {
      expect(find.if).toContain("github.event_name == 'pull_request'");
      expect(find.run).toContain('::error::Merge base not within 1000 commits');
    });
  });
});
