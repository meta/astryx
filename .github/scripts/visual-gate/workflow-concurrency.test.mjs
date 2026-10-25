// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guard PR reporting, preview staging, and remaining Pages writers.
 * @input Workflow definitions plus the docsite builder and PR reconciler.
 * @output Node tests that keep exact-head Vercel links and visual evidence
 *   separate from the remaining Pages publisher until its migration is proven.
 * @position Repository workflow contract tests.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';
import yaml from 'yaml';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const WORKFLOWS = path.join(ROOT, '.github/workflows');

function workflow(name) {
  return fs.readFileSync(path.join(WORKFLOWS, name), 'utf8');
}

describe('PR report and deployment workflow contracts', () => {
  it('publishes canonical CI visual artifacts without taking over capture, comparison, or status', () => {
    const value = workflow('pr-comment.yml');
    expect(value).toContain('name: visual-pr-report');
    expect(value).toContain('run-id: ${{ steps.identity.outputs.run_id }}');
    expect(value).toContain('--head-sha "$HEAD_SHA"');
    expect(value).not.toContain('--base-sha');
    expect(value).toContain('--run-attempt "$RUN_ATTEMPT"');
    expect(value).toContain('publish-pr-report.mjs');
    expect(value).toContain('types: [completed]');
    expect(value).not.toMatch(/gate\.mjs (?:check|capture|release)/);
    expect(value).not.toContain('playwright');
    // Its one status says whether the report was published, on the pull
    // request head; it carries no visual verdict.
    const parsed = yaml.parse(value);
    for (const [name, job] of Object.entries(parsed.jobs)) {
      if (name === 'report') continue;
      expect(JSON.stringify(job), name).not.toContain('createCommitStatus');
    }
    const reportScript = parsed.jobs.report.steps[0].with.script;
    expect(reportScript.match(/createCommitStatus/g)).toHaveLength(1);
    expect(reportScript).toContain("context: 'PR Comment'");
    expect(reportScript).not.toMatch(/visual|verdict/i);
  });

  it('serializes early preview and later CI enrichment per PR, not across PRs', () => {
    const value = yaml.parse(workflow('pr-comment.yml'));
    expect(value.on.deployment_status).toBeDefined();
    expect(value.on.workflow_run.types).toEqual(['completed']);
    expect(value.concurrency).toBeUndefined();
    expect(value.jobs['preview-comment'].concurrency.group).toBe(
      'pr-report-${{ needs.resolve-preview.outputs.pr_number }}',
    );
    for (const job of ['comment', 'spec-only-reconcile']) {
      expect(value.jobs[job].concurrency.group).toBe(
        'pr-report-${{ needs.resolve.outputs.pr_number }}',
      );
      expect(value.jobs[job].concurrency['cancel-in-progress']).toBe(false);
    }
    expect(workflow('pr-comment.yml')).toContain(
      'validateAnalysisMetadata(metadata, {',
    );
  });

  it('routes Vercel success directly to a trusted early comment and CI completion to enrichment', () => {
    const value = workflow('pr-comment.yml');
    const jobs = yaml.parse(value).jobs;
    expect(jobs['resolve-preview'].if).toContain(
      "github.event_name == 'deployment_status'",
    );
    expect(jobs['resolve-preview'].if).toContain(
      "github.event.deployment.environment == 'Preview'",
    );
    expect(jobs['resolve-preview'].if).toContain(
      "github.event.deployment.creator.login == 'vercel[bot]'",
    );
    expect(jobs['resolve-preview'].steps[0].with.ref).toBe('main');
    const guard = jobs['resolve-preview'].steps[1];
    expect(guard.run).toContain('available=false');
    expect(guard.run).toContain('Preview resolver is not on trusted main yet');
    expect(jobs['resolve-preview'].steps[2].if).toBe(
      "steps.trusted.outputs.available == 'true'",
    );
    expect(jobs['resolve-preview'].steps[2].with.script).toContain(
      'resolveVercelDeploymentEvent',
    );
    expect(jobs['preview-comment'].needs).toBe('resolve-preview');
    expect(jobs['preview-comment'].steps[1].with.script).toContain(
      'reconcileEarlyPreviewComment',
    );
    expect(jobs.resolve.if).toContain("github.event_name == 'workflow_run'");
    expect(jobs.comment.needs).toBe('resolve');
    expect(jobs.comment.permissions.deployments).toBe('read');
  });

  it('skips pre-merge deployment events when the resolver is absent from trusted main', () => {
    const guard = yaml.parse(workflow('pr-comment.yml')).jobs['resolve-preview']
      .steps[1];
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-preview-bootstrap-'),
    );
    const output = path.join(root, 'outputs');
    try {
      const run = () =>
        execFileSync('bash', ['-e', '-c', guard.run], {
          cwd: root,
          env: {...process.env, GITHUB_OUTPUT: output},
          encoding: 'utf8',
        });
      expect(run()).toContain('Preview resolver is not on trusted main yet');
      expect(fs.readFileSync(output, 'utf8')).toContain('available=false');
      fs.mkdirSync(path.join(root, '.github/scripts/lib'), {recursive: true});
      fs.writeFileSync(
        path.join(root, '.github/scripts/lib/vercel-preview.mjs'),
        'trusted main',
      );
      fs.writeFileSync(output, '');
      expect(run()).toBe('');
      expect(fs.readFileSync(output, 'utf8')).toContain('available=true');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('reconciles spec-only comments without creating a preview or extra build', () => {
    const value = workflow('pr-comment.yml');
    const reconcile = value.slice(
      value.indexOf('  spec-only-reconcile:'),
      value.indexOf('  comment:'),
    );
    expect(reconcile).toContain('reconcilePrComment');
    expect(reconcile).toContain('createIfMissing: false');
    expect(reconcile).not.toContain('Setup Node and pnpm');
    expect(value).toContain("needs.resolve.outputs.spec_only != 'true'");
  });

  it('keeps visual checks on their canonical CI Storybook artifact', () => {
    const value = workflow('ci.yml');
    const visual = value.slice(
      value.indexOf('  pr-visual:'),
      value.indexOf('  pr-rtl-shard:'),
    );
    expect(visual).toContain(
      '[build-storybook, check-components, maintenance-request, visual-scout]',
    );
    expect(visual).toContain(
      'name: storybook-${{ needs.build-storybook.outputs.short_hash }}',
    );
    expect(visual).toContain('name: visual-pr-report');
    expect(value).toContain('name: pr-analysis');
    expect(value).not.toContain(
      'storybook_url=https://${REPO_OWNER}.github.io',
    );
    expect(value).toContain(
      'name: sandbox-${{ steps.urls.outputs.short_hash }}',
    );
  });

  it('stages both static apps in Vercel preview and production', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'apps/docsite/vercel.json'), 'utf8'),
    );
    expect(config.buildCommand).toContain(
      'node apps/docsite/scripts/build-previews.mjs',
    );
    expect(config.buildCommand).toContain(
      'pnpm -F @astryxdesign/docsite build',
    );
    const builder = fs.readFileSync(
      path.join(ROOT, 'apps/docsite/scripts/build-previews.mjs'),
      'utf8',
    );
    expect(builder).toContain("new Set(['preview', 'production'])");
    expect(builder).toContain('export function buildPreviews(');
    expect(builder).toContain('VERCEL_GIT_COMMIT_SHA');
    expect(builder).toContain("'@astryxdesign/storybook'");
    expect(builder).toContain("'@astryxdesign/sandbox'");
    expect(builder).toContain("SANDBOX_BASE_PATH: '/sandbox'");
    const routing = fs.readFileSync(
      path.join(ROOT, 'apps/docsite/next.config.mjs'),
      'utf8',
    );
    expect(routing).toContain("source: '/sandbox/:path+'");
    expect(routing).toContain("destination: '/sandbox/:path+/index.html'");
    const comment = workflow('pr-comment.yml');
    expect(comment).toContain('deployments: read');
    expect(comment).not.toContain('deploy-preview.yml');
    expect(comment).not.toContain('gh-pages-publisher.mjs');
    const reconciler = fs.readFileSync(
      path.join(ROOT, '.github/scripts/lib/pr-preview.mjs'),
      'utf8',
    );
    expect(reconciler).toContain('resolveVercelPreview');
    expect(reconciler).toContain('`${previewOrigin}/storybook/`');
    expect(reconciler).toContain('`${previewOrigin}/sandbox/`');
  });

  it('publishes only the static compatibility landing to GitHub Pages', () => {
    const pages = yaml.parse(workflow('pages-deploy.yml'));
    expect(pages.on.workflow_run).toBeUndefined();
    expect(pages.on.push.branches).toEqual(['main']);
    expect(pages.concurrency).toEqual({
      group: 'github-pages-landing',
      'cancel-in-progress': true,
    });
    expect(Object.keys(pages.jobs)).toEqual(['deploy']);
    expect(pages.jobs.deploy.permissions).toEqual({
      contents: 'read',
      pages: 'write',
      'id-token': 'write',
    });
    const page = fs.readFileSync(
      path.join(ROOT, '.github/pages/index.html'),
      'utf8',
    );
    expect(page).toContain('https://astryx.atmeta.com/');
    expect(page).toContain('https://astryx.atmeta.com/storybook/');
    expect(page).toContain('https://astryx.atmeta.com/sandbox/');
    expect(page).toContain('aria-label="Astryx destinations"');
    expect(page).toContain(':focus-visible');
  });

  it('keeps CI evidence while removing every branch-backed Pages publisher', () => {
    for (const file of [
      '.github/workflows/deploy-preview.yml',
      '.github/workflows/redeploy-preview.yml',
      '.github/workflows/cleanup-previews.yml',
      '.github/workflows/compact-gh-pages.yml',
      '.github/scripts/gh-pages-publisher.mjs',
      '.github/scripts/lib/gh-pages-publisher.mjs',
      '.github/scripts/lib/gh-pages-publisher.test.mjs',
      'internal/vibe-tests/src/deploy-report.ts',
    ]) {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(false);
    }
    const ci = workflow('ci.yml');
    expect(ci).toContain('--baseline .github/visual-baseline');
    expect(ci).toContain('name: visual-pr-report');
    expect(ci).toContain('retention-days: 30');
    expect(ci).not.toContain('gh-pages');
    expect(workflow('vibe-screenshots.yml')).toContain(
      'name: vibe-test-screenshots',
    );
    expect(workflow('vibe-screenshots.yml')).not.toContain('gh-pages');
    const main = workflow('deploy.yml');
    expect(main).toContain('name: Main');
    expect(main).toContain('pnpm test:ui');
    expect(main).not.toContain('deploy-storybook');
    expect(main).not.toContain('gh-pages');
  });
});
