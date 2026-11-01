// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file generate-pr-comment.test.mjs
 * Pins the diffMode caveat contract of generate-pr-comment.js. analyze-pr.js
 * writes `diffMode` ('three-dot' | 'two-dot') into analysis.json; when the
 * analysis fell back to the approximate two-dot diff, the PR comment must tell
 * readers the component list is not exact, so they don't treat an approximate
 * report as authoritative.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(SCRIPTS_DIR, 'generate-pr-comment.js');

/** Run the comment generator with the given analysis.json; return stdout. */
function runComment(analysis, extraArgs = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-comment-'));
  try {
    const analysisFile = path.join(dir, 'analysis.json');
    fs.writeFileSync(analysisFile, JSON.stringify(analysis));
    return execFileSync(
      process.execPath,
      [SCRIPT, '--analysis', analysisFile, ...extraArgs],
      {
        cwd: dir,
        encoding: 'utf8',
      },
    );
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

const baseAnalysis = {
  newComponents: [],
  modifiedComponents: ['Card'],
  componentStats: {},
  changedPackages: ['@astryxdesign/core'],
  bundlePackages: [],
  totalBundle: null,
};

describe('generate-pr-comment diffMode caveat', () => {
  it('flags an approximate two-dot analysis in the report', () => {
    const stdout = runComment({...baseAnalysis, diffMode: 'two-dot'});
    expect(stdout).toContain('Approximate analysis');
    expect(stdout).toContain('two-dot fallback');
  });

  it('does not caveat an exact three-dot analysis', () => {
    const stdout = runComment({...baseAnalysis, diffMode: 'three-dot'});
    expect(stdout).not.toContain('Approximate analysis');
  });

  it('treats a missing diffMode (older analysis.json) as exact', () => {
    // Back-compat: analyses written before diffMode existed must render clean.
    const stdout = runComment(baseAnalysis);
    expect(stdout).not.toContain('Approximate analysis');
  });
});

describe('generate-pr-comment compact report', () => {
  function withInputs(inputs, analysis = baseAnalysis, extra = []) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-report-'));
    try {
      const args = [];
      for (const [name, value] of Object.entries(inputs)) {
        const file = path.join(dir, `${name}.json`);
        fs.writeFileSync(file, JSON.stringify(value));
        args.push(`--${name}`, file);
      }
      return runComment(analysis, [...args, ...extra]);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }
  const HEAD = 'a'.repeat(40);
  const READY = 'https://astryx-abc123-fbopensource.vercel.app';
  const size = (importGzipBytes, cssGzipBytes = 1000) => ({
    package: '@astryxdesign/core',
    importGzipBytes,
    cssGzipBytes,
  });
  const sized = names => ({
    ...baseAnalysis,
    modifiedComponents: [],
    componentSizes: Object.fromEntries(
      names.map(([key, after]) => [key, size(after)]),
    ),
    baseComponentSizes: Object.fromEntries(
      names.map(([key, , before]) => [key, size(before)]),
    ),
  });

  it("opens with this head's preview, before anything else", () => {
    const out = withInputs({preview: {state: 'ready', sha: HEAD, url: READY}});
    const body = out.slice(out.indexOf('<!-- astryx-pr-analysis -->'));
    expect(body.split('\n')[2]).toBe('### 🔎 Preview · `aaaaaaa`');
    expect(body.split('\n')[4]).toBe(
      `**[Storybook](${READY}/storybook/) · [Sandbox](${READY}/sandbox/)** · built from this PR's head`,
    );
  });

  it('shows three components and collapses the rest, the biggest growth first', () => {
    const out = withInputs(
      {preview: {state: 'ready', sha: HEAD, url: READY}},
      sized([
        ['core/A', 5000, 5000],
        ['core/B', 9000, 8000],
        ['core/C', 7000, 6900],
        ['core/D', 4000, 4100],
        ['core/E', 3000, 2990],
      ]),
    );
    const visible = out.slice(0, out.indexOf('<details>'));
    expect(visible).toContain('### Modified components');
    expect(visible.match(/^\| \[[A-E]\]/gm)).toHaveLength(3);
    expect(visible.indexOf('[B]')).toBeLessThan(visible.indexOf('[C]'));
    expect(visible.indexOf('[C]')).toBeLessThan(visible.indexOf('[E]'));
    expect(out).toContain('<summary>2 more components</summary>');
    expect(out.slice(out.indexOf('<details>'))).toContain(
      `| [D](${READY}/components/D) |`,
    );
    expect(out).toContain(`| [B](${READY}/components/B) |`);
  });

  it('never reports a delta for an unmeasured size', () => {
    const out = runComment({
      ...baseAnalysis,
      componentSizes: {'core/Card': size(null), 'core/New': size(3000)},
      baseComponentSizes: {'core/Card': size(2000)},
    });
    expect(out).toContain('| Card | 1000 B CSS (0) |');
    expect(out).toContain('| New | 2.9 kB (new) · 1000 B CSS (new) |');
  });

  it('fills the base from base stats', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-base-'));
    try {
      const baseFile = path.join(dir, 'base.json');
      fs.writeFileSync(
        baseFile,
        JSON.stringify({baseComponentSizes: {'core/Card': size(2000)}}),
      );
      const out = runComment(
        {...baseAnalysis, componentSizes: {'core/Card': size(1500)}},
        ['--base-stats', baseFile],
      );
      expect(out).toContain('| Card | 1.5 kB (−500 B) · 1000 B CSS (0) |');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('collapses accessibility violations', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-a11y-'));
    try {
      const file = path.join(dir, 'a11y.json');
      fs.writeFileSync(
        file,
        JSON.stringify({
          components: {
            Card: {
              violations: [{id: 'label', impact: 'serious', description: 'x'}],
            },
          },
        }),
      );
      const out = runComment(baseAnalysis, ['--a11y', file]);
      expect(out).toContain('<summary>Accessibility: 1 violation(s)</summary>');
      expect(out).toContain('| Card | — | — | — · ✗ · — |');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('notes a run that did not succeed', () => {
    const out = runComment(baseAnalysis, ['--source-conclusion', 'failure']);
    expect(out).toContain('CI concluded failure');
  });

  it('renders report strings as literal text', () => {
    const out = runComment({
      ...baseAnalysis,
      componentSizes: {'core/<img src=x>': size(1000)},
    });
    expect(out).not.toContain('<img src=x>');
  });
});
