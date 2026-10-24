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

describe('generate-pr-comment preview availability', () => {
  it.each([
    ['none', [], false, false],
    [
      'storybook',
      ['--storybook-url', 'https://example.test/pr/1/'],
      true,
      false,
    ],
    [
      'sandbox',
      ['--sandbox-url', 'https://example.test/pr/1/sandbox/'],
      false,
      true,
    ],
    [
      'both',
      [
        '--storybook-url',
        'https://example.test/pr/1/',
        '--sandbox-url',
        'https://example.test/pr/1/sandbox/',
      ],
      true,
      true,
    ],
  ])(
    'renders independent %s availability',
    (state, urls, storybook, sandbox) => {
      const stdout = runComment(baseAnalysis, [
        ...urls,
        '--preview-state',
        state,
        '--source-conclusion',
        'success',
      ]);

      expect(stdout.includes('View Storybook for this PR')).toBe(storybook);
      expect(stdout.includes('View Sandbox for this PR')).toBe(sandbox);
      expect(stdout.includes('> **Preview availability:**')).toBe(
        !storybook || !sandbox,
      );
      expect(stdout).toContain('<!-- astryx-pr-analysis -->');
    },
  );

  it('explains that failed CI published no previews', () => {
    const stdout = runComment(baseAnalysis, [
      '--preview-state',
      'none',
      '--source-conclusion',
      'failure',
    ]);

    expect(stdout).toContain('CI concluded failure');
    expect(stdout).not.toContain('View Storybook for this PR');
    expect(stdout).not.toContain('View Sandbox for this PR');
  });
});

describe('generate-pr-comment base sizes', () => {
  const sized = {
    ...baseAnalysis,
    componentStats: {
      Card: {package: '@astryxdesign/core', esmSize: '160B', esmBytes: 160},
    },
    bundlePackages: [
      {
        package: '@astryxdesign/core',
        esmSize: '900B',
        gzipSize: '300B',
        gzipBytes: 300,
      },
    ],
  };

  it('fills Before and Delta from base stats', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-base-stats-'));
    try {
      const baseFile = path.join(dir, 'size-base.json');
      fs.writeFileSync(
        baseFile,
        JSON.stringify({
          baseComponentStats: {
            Card: {
              package: '@astryxdesign/core',
              esmSize: '100B',
              esmBytes: 100,
            },
          },
          baseBundlePackages: [
            {package: '@astryxdesign/core', gzipSize: '280B', gzipBytes: 280},
          ],
        }),
      );
      const out = runComment(sized, ['--base-stats', baseFile]);
      expect(out).toContain('| Entry File (ESM) | 100B | 160B | +60B |');
      expect(out).toContain(
        '| @astryxdesign/core | 900B | 280B | 300B | +20B |',
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('never reports a delta for an unmeasured size', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-base-null-'));
    try {
      const baseFile = path.join(dir, 'size-base.json');
      fs.writeFileSync(
        baseFile,
        JSON.stringify({
          baseComponentStats: {
            Card: {
              package: '@astryxdesign/charts',
              esmSize: null,
              esmBytes: null,
            },
          },
          baseBundlePackages: [
            {package: '@astryxdesign/core', gzipSize: null, gzipBytes: null},
          ],
        }),
      );
      const out = runComment(
        {
          ...sized,
          componentStats: {
            Card: {
              package: '@astryxdesign/charts',
              esmSize: null,
              esmBytes: null,
            },
          },
          bundlePackages: [
            {
              package: '@astryxdesign/core',
              esmSize: '900B',
              gzipSize: '300B',
              gzipBytes: 300,
            },
          ],
        },
        ['--base-stats', baseFile],
      );
      expect(out).toContain('| Entry File (ESM) | N/A | N/A | N/A |');
      expect(out).toContain('| @astryxdesign/core | 900B | N/A | 300B | N/A |');
      expect(out).not.toMatch(/\| [+-]?0B \|/);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('keeps N/A without base stats', () => {
    const out = runComment(sized);
    expect(out).toContain('| Entry File (ESM) | N/A | 160B | N/A |');
    expect(out).toContain('| Package | Size (ESM) | Size (CJS) | Gzipped |');
  });
});
