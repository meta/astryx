// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Contract: release-merge-back runs only for a release merge-back branch.
 * @input CI workflow YAML
 * @output The job's condition for merge-back and ordinary pull requests
 * @position Node contract beside release-publish-workflow.test.mjs
 *
 * The job checks out the whole history on a larger runner and then validates
 * a merge-back branch. Every other pull request used to pay for that checkout
 * only to learn from its branch name that nothing applied.
 */

import fs from 'node:fs';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {ungated} from './ci-pr-gate.mjs';

const ci = yaml.parse(
  fs.readFileSync(new URL('../workflows/ci.yml', import.meta.url), 'utf8'),
);
const job = ci.jobs['release-merge-back'];

function runs({event = 'pull_request', base = 'main', head}) {
  // The pull-request gate in front is ci-pr-gate.test.mjs's to prove.
  const expression = ungated(job.if).replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  return Function(
    'github',
    'startsWith',
    'endsWith',
    `return Boolean(${expression});`,
  )(
    {event_name: event, base_ref: base, head_ref: head},
    (value, prefix) => String(value).startsWith(prefix),
    (value, suffix) => String(value).endsWith(suffix),
  );
}

describe('release-merge-back routing', () => {
  it('runs for a release merge-back branch into main', () => {
    expect(runs({head: 'chore/merge-v0.7.5-to-main'})).toBe(true);
  });

  it.each([
    'fix/list-focus-ring-clip',
    'chore/merge-main-into-feature',
    'chore/merge-v0.7.5-to-release',
    'uikit/c19-menu-late-click',
  ])('skips %s before its checkout', head => {
    expect(runs({head})).toBe(false);
  });

  it('skips a merge-back name aimed anywhere but main, and non-PR events', () => {
    expect(
      runs({head: 'chore/merge-v0.7.5-to-main', base: 'release/v0.7.5'}),
    ).toBe(false);
    expect(
      runs({event: 'workflow_dispatch', head: 'chore/merge-v0.7.5-to-main'}),
    ).toBe(false);
  });

  it('still checks the exact branch contract after the checkout', () => {
    const scope = job.steps.find(
      step => step.name === 'Detect the release-merge-back branch contract',
    ).run;
    expect(scope).toContain('chore/merge-v*-to-main');
    expect(scope).toContain("grep -Eq '^[0-9]+\\.[0-9]+\\.[0-9]+$'");
  });
});
