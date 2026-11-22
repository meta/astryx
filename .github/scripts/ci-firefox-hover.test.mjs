// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ci-firefox-hover.test.mjs
 * @input .github/workflows/ci.yml and the Firefox hover spec list
 * @output Proof that a pull request runs its Firefox hover specs only when it
 *   changes what they reach, only once its heavy suites run, on a standard
 *   runner, report-only, and that no other job reads the result
 * @position Workflow contract tests for the pull-request Firefox hover leg
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

import {FIREFOX_HOVER_SPECS} from './lib/a11y-spec-files.mjs';

const ci = yaml.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, '../workflows/ci.yml'),
    'utf8',
  ),
);
const job = ci.jobs['pr-firefox-hover'];
const legs = ci.jobs['interaction-legs'];
const scope = legs.steps.find(step => step.id === 'scope-firefox');
const inScope = file => new RegExp(scope.with.paths).test(file);
const step = name => job.steps.find(each => each.name === name);

describe("a pull request's Firefox hover scope", () => {
  it('reaches every listed hover spec', () => {
    for (const file of FIREFOX_HOVER_SPECS)
      expect(inScope(file), file).toBe(true);
  });

  it("reaches the hover components' code and the shared hover and dismiss code", () => {
    for (const file of [
      'packages/core/src/Tooltip/useTooltip.tsx',
      'packages/core/src/InfoTip/InfoTip.tsx',
      'packages/core/src/HoverCard/popupTrigger.ts',
      'packages/core/src/DropdownMenu/menuItemHover.ts',
      'packages/core/src/NavMenu/NavHeadingMenu.tsx',
      'packages/core/src/hooks/useMenuHover.ts',
      'packages/core/src/Layer/useLayerDismissal.ts',
      'packages/core/src/utils/interactionModality.ts',
      'playwright.config.ts',
      'internal/a11y-spec/src/playwright.ts',
      '.github/firefox-known-failures.json',
      '.github/scripts/firefox-hover-report.mjs',
      '.github/scripts/lib/a11y-spec-files.mjs',
    ])
      expect(inScope(file), file).toBe(true);
  });

  it('leaves out unit tests, docs, interaction proofs and other components', () => {
    for (const file of [
      'packages/core/src/Tooltip/useTooltip.test.tsx',
      'packages/core/src/Tooltip/Tooltip.doc.mjs',
      'packages/core/src/DropdownMenu/README.md',
      'packages/core/src/Popover/__tests__/PopoverKeyboard.interaction.browser.spec.ts',
      'packages/core/src/DropdownMenu/__tests__/DropdownMenuTouchPress.interaction.browser.spec.ts',
      'packages/core/src/Button/Button.tsx',
      'packages/core/src/Layer/layerExitCopy.ts',
      'docs/specs/components/Tooltip/Tooltip.spec.md',
    ])
      expect(inScope(file), file).toBe(false);
  });

  it('is decided for pull requests only, and handed to the leg', () => {
    expect(scope.uses).toBe('./.test-scope/.github/actions/test-scope');
    expect(scope.with['outside-pull-request']).toBe('skip');
    expect(legs.outputs.firefox).toBe(
      '${{ steps.scope-firefox.outputs.applies }}',
    );
  });
});

describe('the pull-request Firefox hover leg', () => {
  it('starts only on a ready pull request in scope, once its heavy suites run', () => {
    expect(job.if).toContain("github.event_name == 'pull_request'");
    expect(job.if).toContain('!github.event.pull_request.draft');
    expect(job.if).toContain(
      "needs.interaction-legs.outputs.firefox == 'true'",
    );
    expect(job.if).toContain("needs.heavy-ci.outputs.deferred != 'true'");
    expect(job.if).toContain("needs.build-storybook.result == 'success'");
  });

  it('waits for room, and no per-author heavy-suite cap holds it (report-only)', () => {
    expect(job.needs).toEqual(
      expect.arrayContaining(['room', 'admission', 'heavy-ci']),
    );
    expect(job.if).toContain("needs.admission.outputs.full != 'true'");
    expect(
      job.steps.some(each =>
        String(each.uses ?? '').includes('.github/actions/heavy-caps'),
      ),
    ).toBe(false);
    expect(job.steps.some(each => each.name === 'Heavy suite runs')).toBe(
      false,
    );
    expect(job.permissions).toEqual({contents: 'read'});
  });

  it('labels its report with the head it checked out, and names a head that predates the project or the report', () => {
    expect(step('Report the Firefox hover results').env.ASTRYX_HEAD_SHA).toBe(
      '${{ github.event.pull_request.head.sha || github.sha }}',
    );
    expect(step('Name a head without the Firefox project').if).toBe(
      "always() && steps.project.outputs.present != 'true'",
    );
    expect(step('Name a head without the Firefox project').run).toContain(
      'merge main to run them',
    );
    expect(step('Name a head without the Firefox hover report').run).toContain(
      'merge main for the report',
    );
  });

  it('runs the Firefox project at the head on a standard runner', () => {
    expect(job['runs-on']).toBe('ubuntu-latest');
    expect(job.container.image).toBe(
      ci.jobs['pr-interaction-webkit'].container.image,
    );
    expect(step('Checkout').with.ref).toBe(
      '${{ github.event.pull_request.head.sha || github.sha }}',
    );
    const specs = job.steps.find(each => each.id === 'specs');
    expect(specs.run).toContain(
      'playwright test --config playwright.config.ts --project firefox',
    );
    // Firefox does not start as root in a HOME the runner's user owns.
    expect(specs.env.HOME).toBe('/root');
  });

  it('is report-only: a failing spec cannot fail it, and no job or join reads it', () => {
    const specs = job.steps.find(each => each.id === 'specs');
    expect(specs['continue-on-error']).toBe(true);
    for (const [id, other] of Object.entries(ci.jobs)) {
      if (id === 'pr-firefox-hover') continue;
      expect([other.needs ?? []].flat(), id).not.toContain('pr-firefox-hover');
    }
  });

  it('always reports known and new failures and keeps the report', () => {
    const report = step('Report the Firefox hover results');
    expect(report.if).toContain('always()');
    expect(report.run).toContain('.github/scripts/firefox-hover-report.mjs');
    const specs = job.steps.find(each => each.id === 'specs');
    expect(report.run).toContain(specs.env.PLAYWRIGHT_JSON_OUTPUT_NAME);
    expect(step('Upload the Firefox hover report').if).toContain('always()');
  });
});
