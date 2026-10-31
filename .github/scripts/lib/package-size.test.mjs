// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file package-size.test.mjs
 * Pins the published-package-size check: which packages count as published,
 * what `npm pack` measures, the advisory budget flag (a tarball growing more
 * than 5% and at least 1 KB), the runtime-dependency diff, the Markdown, and
 * the CLI, which flags and never fails.
 */

import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, describe, expect, it} from 'vitest';
import sizes from './package-size.js';

const {
  PACKED_BUDGET_MIN_BYTES,
  publishedPackages,
  measurePackages,
  overBudget,
  comparePackageSizes,
  renderPackageSizeSection,
} = sizes;

const CLI = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'package-size.mjs',
);

const temporary = [];
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-package-size-'));
  temporary.push(dir);
  return dir;
}

function writePackage(root, relative, manifest, files = {}) {
  const dir = path.join(root, relative);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), {recursive: true});
    fs.writeFileSync(path.join(dir, name), contents);
  }
  return dir;
}

function measurement(packages) {
  return {schema: 1, packages};
}

function pkg(packedBytes, dependencies = {}, extra = {}) {
  return {
    packedBytes,
    unpackedBytes: packedBytes * 4,
    files: 10,
    dependencies,
    ...extra,
  };
}

describe('publishedPackages', () => {
  it('keeps public scoped packages and drops private, canary-only and unscoped ones', () => {
    const root = tempDir();
    writePackage(root, 'packages/core', {name: '@astryxdesign/core'});
    writePackage(root, 'packages/themes/neutral', {
      name: '@astryxdesign/theme-neutral',
    });
    writePackage(root, 'packages/lab', {
      name: '@astryxdesign/lab',
      private: true,
    });
    writePackage(root, 'packages/canary', {
      name: '@astryxdesign/canary',
      astryx: {canaryOnly: true},
    });
    writePackage(root, 'packages/other', {name: 'unscoped'});
    expect(publishedPackages(root).map(entry => entry.manifest.name)).toEqual([
      '@astryxdesign/core',
      '@astryxdesign/theme-neutral',
    ]);
  });
});

describe('measurePackages', () => {
  it('records npm pack sizes and runtime dependencies, not dev dependencies', async () => {
    const root = tempDir();
    writePackage(root, 'packages/core', {
      name: '@astryxdesign/core',
      dependencies: {'@stylexjs/stylex': '^0.19.0'},
      peerDependencies: {react: '>=19'},
      devDependencies: {vitest: '4'},
    });
    const result = await measurePackages(root, async () => ({
      size: 100,
      unpackedSize: 400,
      entryCount: 3,
    }));
    expect(result.packages['@astryxdesign/core']).toEqual({
      packedBytes: 100,
      unpackedBytes: 400,
      files: 3,
      dependencies: {
        'dependencies:@stylexjs/stylex': '^0.19.0',
        'peerDependencies:react': '>=19',
      },
    });
  });

  it('measures a real package with npm pack, honouring files and skipping lifecycle scripts', async () => {
    const root = tempDir();
    writePackage(
      root,
      'packages/core',
      {
        name: '@astryxdesign/core',
        version: '0.0.0',
        files: ['dist'],
        scripts: {prepack: 'exit 1'},
      },
      {
        'dist/index.js': 'export const a = 1;\n'.repeat(200),
        'src/index.test.ts': 'not shipped',
      },
    );
    const {packages} = await measurePackages(root);
    const core = packages['@astryxdesign/core'];
    // package.json and dist/index.js; the test file is outside `files`.
    expect(core.files).toBe(2);
    expect(core.unpackedBytes).toBeGreaterThan(4000);
    expect(core.packedBytes).toBeGreaterThan(0);
    expect(core.packedBytes).toBeLessThan(core.unpackedBytes);
  });
});

describe('overBudget', () => {
  it('needs more than 5% and at least the byte floor', () => {
    const base = 100 * 1024;
    expect(overBudget(base, base + 5 * 1024)).toBe(false); // exactly 5%
    expect(overBudget(base, base + 5 * 1024 + 1)).toBe(true);
    // 10% of a small package, but under the floor.
    expect(overBudget(5000, 5000 + PACKED_BUDGET_MIN_BYTES - 1)).toBe(false);
    expect(overBudget(5000, 5000 + PACKED_BUDGET_MIN_BYTES)).toBe(true);
  });

  it('never fires without both measurements', () => {
    expect(overBudget(undefined, 999999)).toBe(false);
    expect(overBudget(1000, null)).toBe(false);
    expect(overBudget(0, 999999)).toBe(false);
  });
});

describe('comparePackageSizes', () => {
  const base = measurement({
    '@astryxdesign/core': pkg(100_000, {
      'dependencies:@stylexjs/stylex': '^0.19.0',
    }),
    '@astryxdesign/theme-neutral': pkg(20_000),
  });

  it('passes an unchanged head', () => {
    const report = comparePackageSizes({head: base, base});
    expect(report.verdict).toBe('pass');
    expect(report.packages.every(entry => !entry.overBudget)).toBe(true);
    expect(report.addedDependencies).toEqual([]);
  });

  it('flags a package past the budget', () => {
    const head = measurement({
      ...base.packages,
      '@astryxdesign/core': pkg(
        110_000,
        base.packages['@astryxdesign/core'].dependencies,
      ),
    });
    const flagged = comparePackageSizes({head, base});
    expect(flagged.verdict).toBe('over-budget');
    expect(
      flagged.packages.find(entry => entry.name === '@astryxdesign/core')
        .overBudget,
    ).toBe(true);
  });

  it('lists added and removed runtime dependencies', () => {
    const head = measurement({
      '@astryxdesign/core': pkg(100_000, {'dependencies:lodash': '^4.17.21'}),
      '@astryxdesign/theme-neutral': pkg(20_000),
    });
    const report = comparePackageSizes({head, base});
    expect(report.addedDependencies).toEqual([
      {
        package: '@astryxdesign/core',
        field: 'dependencies',
        name: 'lodash',
        range: '^4.17.21',
      },
    ]);
    expect(report.removedDependencies).toEqual([
      {
        package: '@astryxdesign/core',
        field: 'dependencies',
        name: '@stylexjs/stylex',
        range: '^0.19.0',
      },
    ]);
  });

  it('reports a newly published package without a budget, its dependencies as new', () => {
    const head = measurement({
      ...base.packages,
      '@astryxdesign/new': pkg(50_000, {'peerDependencies:react': '>=19'}),
    });
    const report = comparePackageSizes({head, base});
    const added = report.packages.find(
      entry => entry.name === '@astryxdesign/new',
    );
    expect(added.base).toBeNull();
    expect(added.overBudget).toBe(false);
    expect(report.verdict).toBe('pass');
    expect(report.addedDependencies).toEqual([
      {
        package: '@astryxdesign/new',
        field: 'peerDependencies',
        name: 'react',
        range: '>=19',
      },
    ]);
  });

  it('applies no budget and diffs no dependencies without a base', () => {
    const head = measurement({
      '@astryxdesign/core': pkg(999_999, {'dependencies:x': '1'}),
    });
    const report = comparePackageSizes({head, base: null});
    expect(report.verdict).toBe('no-base');
    expect(report.addedDependencies).toEqual([]);
  });
});

describe('renderPackageSizeSection', () => {
  const base = measurement({
    '@astryxdesign/core': pkg(100_000),
    '@astryxdesign/theme-neutral': pkg(20_000),
    '@astryxdesign/theme-stone': pkg(20_000),
  });

  it('shows only changed packages and counts the rest', () => {
    const head = measurement({
      ...base.packages,
      '@astryxdesign/core': pkg(101_000),
    });
    const markdown = renderPackageSizeSection(
      comparePackageSizes({head, base}),
    );
    expect(markdown).toContain('### Published Package Size');
    expect(markdown).toContain(
      '| @astryxdesign/core | 97.7KB | 98.6KB | +1000B (+1.0%) |',
    );
    expect(markdown).not.toContain('theme-neutral');
    expect(markdown).toContain('2 other published packages are unchanged.');
    expect(markdown).not.toContain('Over the package budget');
  });

  it('writes a package past 1 MB in MB', () => {
    const big = measurement({'@astryxdesign/core': pkg(9_000_000)});
    const markdown = renderPackageSizeSection(
      comparePackageSizes({
        head: measurement({'@astryxdesign/core': pkg(9_100_000)}),
        base: big,
      }),
    );
    expect(markdown).toContain(
      '| @astryxdesign/core | 8.58MB | 8.68MB | +97.7KB (+1.1%) |',
    );
  });

  it('says when nothing changed', () => {
    const markdown = renderPackageSizeSection(
      comparePackageSizes({head: base, base}),
    );
    expect(markdown).toContain(
      'No published package changed size (3 measured).',
    );
  });

  it('flags the row and asks the author when over budget', () => {
    const head = measurement({
      ...base.packages,
      '@astryxdesign/core': pkg(110_000),
    });
    const markdown = renderPackageSizeSection(
      comparePackageSizes({head, base}),
    );
    expect(markdown).toMatch(
      /\| @astryxdesign\/core \|[^\n]*\(\+10\.0%\) ⚠️ \|/,
    );
    expect(markdown).toContain('**⚠️ Over the package budget:**');
    expect(markdown).toContain('say why in the pull request description');
  });

  it('shows every head size and no budget without a base', () => {
    const markdown = renderPackageSizeSection(
      comparePackageSizes({head: base, base: null}),
    );
    expect(markdown).toContain('with no budget');
    expect(markdown).toContain('theme-stone');
  });

  it('renders report strings through the given escaper', () => {
    const head = measurement({
      '@astryxdesign/core': pkg(100_000, {'dependencies:<img src=x>': '1'}),
    });
    const markdown = renderPackageSizeSection(
      comparePackageSizes({
        head,
        base: measurement({'@astryxdesign/core': pkg(100_000)}),
      }),
      text => `[${text}]`,
    );
    expect(markdown).toContain(
      '- [@astryxdesign/core]: [<img src=x>] [1] ([dependencies])',
    );
  });
});

describe('package-size.mjs', () => {
  function runCli(args) {
    return spawnSync(process.execPath, [CLI, ...args], {encoding: 'utf8'});
  }

  function compare({head, base}) {
    const dir = tempDir();
    const file = name => path.join(dir, name);
    fs.writeFileSync(file('head.json'), JSON.stringify(head));
    if (base) fs.writeFileSync(file('base.json'), JSON.stringify(base));
    const result = runCli([
      'compare',
      '--head',
      file('head.json'),
      '--base',
      file('base.json'),
      '--head-sha',
      'a'.repeat(40),
      '--output',
      file('report.json'),
      '--summary',
      file('summary.md'),
    ]);
    return {
      result,
      report: JSON.parse(fs.readFileSync(file('report.json'), 'utf8')),
      summary: fs.readFileSync(file('summary.md'), 'utf8'),
    };
  }

  const base = measurement({'@astryxdesign/core': pkg(100_000)});
  const grown = measurement({'@astryxdesign/core': pkg(110_000)});

  it('flags an overrun with a warning and never fails', () => {
    const {result, report, summary} = compare({head: grown, base});
    expect(result.status).toBe(0);
    expect(report.headSha).toBe('a'.repeat(40));
    expect(summary).toContain('**⚠️ Over the package budget:**');
    expect(result.stdout).toContain(
      '::warning title=Package size over budget::',
    );
    expect(result.stdout).not.toContain('::error');
  });

  it.each([
    ['no-merge-base', 'not within the fetched history'],
    ['not-kept', 'could not be found or read'],
  ])('names why there is no base: %s', (reason, text) => {
    const report = comparePackageSizes({
      head: grown,
      base: null,
      baseReason: reason,
    });
    expect(report.baseReason).toBe(reason);
    expect(renderPackageSizeSection(report)).toContain(text);
  });

  it('compares without a base, with a notice and no flag', () => {
    const {result, report} = compare({head: grown, base: null});
    expect(result.status).toBe(0);
    expect(report.verdict).toBe('no-base');
    expect(result.stdout).toContain('::notice::');
    expect(result.stdout).not.toContain('::warning');
  });

  it('measure writes every published package of a workspace', () => {
    const root = tempDir();
    writePackage(
      root,
      'packages/core',
      {name: '@astryxdesign/core', version: '0.0.0'},
      {
        'index.js': 'export {};\n',
      },
    );
    const output = path.join(root, 'out.json');
    execFileSync(process.execPath, [
      CLI,
      'measure',
      '--root',
      root,
      '--output',
      output,
    ]);
    const written = JSON.parse(fs.readFileSync(output, 'utf8'));
    expect(Object.keys(written.packages)).toEqual(['@astryxdesign/core']);
  });
});
