// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input Synthetic independent owners and the repository's real workflows.
 * @output Red-arm coverage for AST-030 FR12 without banning non-visual evidence.
 * @position Node tests for the existing repository guardrail lane.
 */
import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';
import YAML from 'yaml';

import {
  checkVisualWorkflowOwner,
  findVisualOwners,
} from './check-visual-workflow-owner.mjs';

const root = path.resolve(import.meta.dirname, '..');
const canonical = {
  name: 'CI',
  on: {pull_request: {}},
  jobs: {
    'pr-visual': {
      steps: [{run: 'node .github/scripts/visual-gate/gate.mjs check'}],
    },
  },
};
function owners(job, options = {}) {
  return findVisualOwners(
    {
      'ci.yml': YAML.stringify(canonical),
      [options.file ?? 'another.yml']: YAML.stringify({
        name: 'Another check',
        on: options.on ?? {pull_request: {}},
        jobs: {check: job},
      }),
    },
    options.scripts,
  );
}

describe('single visual workflow owner', () => {
  it('accepts the canonical Storybook owner', () => {
    expect(findVisualOwners({'ci.yml': YAML.stringify(canonical)})).toEqual([]);
  });

  it.each(['check', 'capture', 'release', 'flaky'])(
    'rejects another gate.mjs %s owner even under a neutral name',
    command => {
      expect(
        owners({
          steps: [
            {run: `node .github/scripts/visual-gate/gate.mjs ${command}`},
          ],
        }),
      ).toEqual([expect.stringContaining('another.yml → check')]);
    },
  );

  it.each([
    {schedule: [{cron: '0 0 * * *'}]},
    {workflow_dispatch: {}},
    {workflow_run: {workflows: ['CI'], types: ['completed']}},
    {pull_request_target: {types: ['closed']}},
    {workflow_call: {}},
  ])('rejects duplicate capture regardless of trigger: %j', on => {
    expect(
      owners(
        {steps: [{run: 'node gate.mjs capture'}]},
        {on, file: 'renamed.yaml'},
      ),
    ).toHaveLength(1);
  });

  it.each([
    {run: 'pnpm visual:check'},
    {run: 'npx percy storybook ./dist'},
    {uses: 'chromaui/action@v1'},
    {uses: 'percy/exec-action@v1'},
    {run: 'node -e "expect(page).toHaveScreenshot()"'},
    {run: 'node -e "pixelmatch(before, after)"'},
    {
      uses: 'actions/github-script@v9',
      with: {script: 'await expect(page).toHaveScreenshot();'},
    },
  ])('rejects independent visual runners: %j', step => {
    // chromaui is the action name for Chromatic, not an artifact publisher.
    expect(owners({steps: [step]})).toHaveLength(1);
  });

  it('follows package-script aliases and terminates cycles', () => {
    expect(
      owners(
        {steps: [{run: 'pnpm run screenshots'}]},
        {
          scripts: {
            screenshots: 'pnpm run compare',
            compare: 'pnpm visual:check',
          },
        },
      ),
    ).toHaveLength(1);
    expect(
      owners(
        {steps: [{run: 'pnpm run first'}]},
        {
          scripts: {first: 'pnpm second', second: 'pnpm first'},
        },
      ),
    ).toEqual([]);
  });

  it.each([
    'visual-capture',
    'visual-pr-report',
    'visual-report',
    'component-visual-regression',
  ])('rejects a second producer of %s', name => {
    expect(
      owners({
        steps: [
          {uses: 'actions/upload-artifact@v7', with: {name, path: 'result'}},
        ],
      }),
    ).toHaveLength(1);
  });

  it('rejects a separately named visual owner and a second canonical-workflow job', () => {
    expect(
      owners({name: 'Visual regression', steps: [{run: 'node custom.mjs'}]}),
    ).toHaveLength(1);
    const duplicate = structuredClone(canonical);
    duplicate.jobs.another = {steps: [{run: 'pnpm visual:check'}]};
    expect(findVisualOwners({'ci.yml': YAML.stringify(duplicate)})).toEqual([
      expect.stringContaining('ci.yml → another'),
    ]);
  });

  it.each([
    'deploy-storybook',
    'storybook-abc123',
    'a11y-report',
    'rtl-audit-report-core',
    'vibe-test-screenshots',
    'screenshot-manifest',
  ])('permits non-visual-regression artifact %s', name => {
    expect(
      owners({
        steps: [
          {
            uses: 'actions/upload-artifact@v7',
            with: {name, path: 'screenshots'},
          },
        ],
      }),
    ).toEqual([]);
  });

  it('permits report-only publication and browser audits', () => {
    expect(
      owners({
        steps: [
          {
            uses: 'actions/download-artifact@v8',
            with: {name: 'visual-pr-report'},
          },
          {run: 'node .github/scripts/visual-gate/publish-pr-report.mjs'},
          {
            run: 'node .github/scripts/gh-pages-publisher.mjs immutable-path --scope pr-visual/evidence',
          },
          {run: 'pnpm test:a11y-contract'},
          {run: 'pnpm rtl:audit'},
          {run: 'npx playwright install chromium'},
          {run: 'npx tsx src/screenshot-previews.ts'},
        ],
      }),
    ).toEqual([]);
  });

  it('ignores YAML and shell comments', () => {
    const source = YAML.stringify({
      jobs: {check: {steps: [{run: '# node gate.mjs check\necho audit'}]}},
    });
    expect(
      findVisualOwners({
        'ci.yml': YAML.stringify(canonical),
        'audit.yml': `# visual regression uses ci.yml\n${source}`,
      }),
    ).toEqual([]);
  });

  it('fails closed on invalid YAML or a missing canonical check', () => {
    expect(findVisualOwners({'broken.yml': 'jobs: [broken'})).toEqual([
      expect.stringContaining('invalid workflow YAML'),
      expect.stringContaining('canonical Storybook visual check is missing'),
    ]);
    expect(findVisualOwners({'ci.yml': YAML.stringify({jobs: {}})})).toEqual([
      expect.stringContaining('canonical Storybook visual check is missing'),
    ]);
  });

  it('checks the real repository through the existing check:repo lane', () => {
    expect(checkVisualWorkflowOwner(root)).toEqual([]);
    const {scripts} = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    expect(scripts['check:repo'].split(' && ')).toContain(
      'pnpm check:visual-owner',
    );
    expect(scripts['check:visual-owner']).toBe(
      'node scripts/check-visual-workflow-owner.mjs',
    );
  });
});
