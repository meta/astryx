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

describe('generate-pr-comment status table', () => {
  function withInputs(inputs, analysis = baseAnalysis, extra = []) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-status-'));
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
  const ALIAS = 'https://astryx-git-my-branch-fbopensource.vercel.app';

  it('leads with the status table, the preview first', () => {
    const out = withInputs({preview: {state: 'ready', sha: HEAD, url: READY}});
    const table = out.indexOf('| Check | Result |');
    expect(table).toBeGreaterThan(out.indexOf('<!-- astryx-pr-analysis -->'));
    expect(out.slice(table)).toMatch(
      /^\| Check \| Result \|\n\|-------\|--------\|\n\| Preview \|/,
    );
    expect(out).toContain(
      `| Preview | [Storybook](${READY}/storybook/) · [Sandbox](${READY}/sandbox/) · [Docs](${READY}/) · built from \`aaaaaaa\` |`,
    );
    expect(out).not.toMatch(/CodeBunny/i);
  });

  it.each([
    [
      'building',
      {state: 'building', sha: HEAD, aliasOrigin: ALIAS},
      `⏳ Preview building for \`aaaaaaa\`… Until it's ready, [Storybook](${ALIAS}/storybook/)`,
    ],
    ['failed', {state: 'failed', sha: HEAD}, 'failed to build'],
    [
      'fork',
      {state: 'fork', sha: HEAD},
      'No preview for pull requests from forks.',
    ],
    ['unknown', {state: 'unknown', sha: HEAD}, 'cannot be known in advance'],
  ])('says what a %s preview is, honestly', (_label, preview, text) => {
    const out = withInputs({preview});
    expect(out).toContain(text);
    if (preview.state !== 'building') expect(out).not.toContain('/storybook/');
  });

  it('shows no preview row on a draft, which links no preview', () => {
    const out = withInputs({});
    expect(out).toContain('| Check | Result |');
    expect(out).not.toContain('| Preview |');
  });

  it('says a heavy suite did not run, with the label that runs it', () => {
    const out = withInputs({
      jobs: [
        {name: 'pr-visual', conclusion: 'skipped', steps: []},
        {name: 'pr-rtl', conclusion: 'skipped', steps: []},
      ],
    });
    expect(out).toContain(
      '| Visual | ⏭ Visual did not run on this pull request; add `ci:run-visual` to run it. |',
    );
    expect(out).toContain(
      '| Accessibility | ⏭ Accessibility did not run on this pull request; add `ci:run-a11y` to run it. |',
    );
    expect(out).toContain(
      '| RTL | ⏭ RTL did not run on this pull request; add `ci:run-rtl` to run it. |',
    );
    expect(out).not.toContain('| Perf |');
  });

  it('notes a run that did not succeed', () => {
    const out = runComment(baseAnalysis, ['--source-conclusion', 'failure']);
    expect(out).toContain('CI concluded failure');
  });

  it('collapses the size tables', () => {
    const out = runComment({
      ...baseAnalysis,
      componentSizes: {
        'core/Card': {
          package: '@astryxdesign/core',
          importGzipBytes: 2000,
          cssGzipBytes: 100,
        },
      },
    });
    expect(out).toContain('<summary>Size details</summary>');
    expect(out.indexOf('<summary>Size details</summary>')).toBeLessThan(
      out.indexOf('### Component Size'),
    );
    expect(out).toMatch(/\| Size \| ✅ 1 component\(s\) within budget/);
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

describe('generate-pr-comment touch-only budget', () => {
  function withBase(head, base) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-budget-'));
    try {
      const baseFile = path.join(dir, 'size-base.json');
      fs.writeFileSync(
        baseFile,
        JSON.stringify({
          baseComponentSizes: {'core/BottomSheet': base},
          baseBundlePackages: [],
        }),
      );
      return runComment(
        {
          ...baseAnalysis,
          modifiedComponents: [],
          componentSizes: {'core/BottomSheet': head},
          bundlePackages: [],
        },
        ['--base-stats', baseFile],
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }

  it('flags JavaScript growth over 2 KB and CSS growth over 1 KB, family folders included', () => {
    const out = withBase(
      {
        package: '@astryxdesign/core',
        importGzipBytes: 10000,
        cssGzipBytes: 3000,
      },
      {
        package: '@astryxdesign/core',
        importGzipBytes: 7000,
        cssGzipBytes: 1900,
      },
    );
    expect(out).toContain('### ⚠️ Touch-only size budget');
    expect(out).toContain(
      '| core/BottomSheet | 6.8KB | 9.8KB | +2.9KB ⚠️ | 1.9KB | 2.9KB | +1.1KB ⚠️ |',
    );
  });

  it('does not flag growth within budget', () => {
    const out = withBase(
      {
        package: '@astryxdesign/core',
        importGzipBytes: 9000,
        cssGzipBytes: 2900,
      },
      {
        package: '@astryxdesign/core',
        importGzipBytes: 7000,
        cssGzipBytes: 1900,
      },
    );
    expect(out).not.toContain('Touch-only size budget');
    expect(out).toContain(
      '| core/BottomSheet | 6.8KB | 8.8KB | +2.0KB | 1.9KB | 2.8KB | +1000B |',
    );
  });

  it('does not flag a component that is new at head', () => {
    const out = withBase(
      {
        package: '@astryxdesign/core',
        importGzipBytes: 90000,
        cssGzipBytes: 9000,
      },
      {
        package: '@astryxdesign/core',
        importGzipBytes: null,
        cssGzipBytes: null,
      },
    );
    expect(out).not.toContain('Touch-only size budget');
  });
});

describe('published package size', () => {
  function withPackageSize(report) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-package-size-'));
    try {
      const file = path.join(dir, 'package-size.json');
      fs.writeFileSync(file, JSON.stringify(report));
      return runComment({newComponents: [], modifiedComponents: []}, [
        '--package-size',
        file,
      ]);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }

  const sizes = (packedBytes, files = 10) => ({
    packedBytes,
    unpackedBytes: packedBytes * 4,
    files,
  });

  it('renders the section after the bundle summary, with new dependencies', () => {
    const out = withPackageSize({
      headSha: 'a'.repeat(40),
      budget: {packedPercent: 5, packedMinBytes: 1024},
      packages: [
        {
          name: '@astryxdesign/core',
          base: sizes(100000, 10),
          head: sizes(110000, 12),
          overBudget: true,
        },
      ],
      addedDependencies: [
        {
          package: '@astryxdesign/core',
          field: 'dependencies',
          name: 'left-pad',
          range: '^1.3.0',
        },
      ],
      removedDependencies: [],
      justification: null,
      verdict: 'over-budget',
    });
    expect(out.indexOf('### Bundle Size Summary')).toBeLessThan(
      out.indexOf('### Published Package Size'),
    );
    expect(out).toContain(
      '| @astryxdesign/core | 97.7KB | 107.4KB | +9.8KB (+10.0%) ⚠️ |',
    );
    expect(out).toContain('| 10 → 12 |');
    expect(out).toContain('left-pad');
    expect(out).toContain('**Over budget:**');
  });

  it('renders report strings as literal text', () => {
    const out = withPackageSize({
      packages: [
        {
          name: '<img src=x onerror=alert(1)>',
          base: sizes(1000),
          head: sizes(2000),
          overBudget: false,
        },
      ],
      addedDependencies: [],
      removedDependencies: [],
      verdict: 'pass',
    });
    expect(out).not.toContain('<img src=x');
  });

  it('leaves the section out without a report', () => {
    const out = runComment({newComponents: [], modifiedComponents: []});
    expect(out).not.toContain('Published Package Size');
  });
});
