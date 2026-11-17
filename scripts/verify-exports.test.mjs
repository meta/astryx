// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file verify-exports.test.mjs
 * Unit tests for the packaging gate. A canary package could ship a dist that no
 * consumer could import and this gate still passed: `private: true` skipped the
 * package outright, `default`-condition targets were never probed, a `.js`
 * entry without `"type": "module"` loaded through Node's syntax detection, and
 * a `default` declared before an `import` was skipped although Node takes it.
 *
 * The rules are exercised against fixture package trees, not just the repo: a
 * gate that scans the wrong thing passes exactly like one that works. The last
 * block then runs them over the real workspace manifests, so the rules and the
 * data they are pointed at are both covered.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect, afterAll} from 'vitest';
import {
  checkPackageExports,
  probeLoadTargets,
  resolveExportTarget,
  verifyExports,
} from './verify-exports.mjs';
import {isPublished} from './npm/published-manifests.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Temp roots created by the fixture helper, removed after the run. */
const tempRoots = [];

afterAll(() => {
  for (const dir of tempRoots) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

/**
 * Write a `packages/` tree the gate can walk.
 *
 * `packages` maps a directory name to `{manifest, files}` — `manifest` is
 * written as its package.json, `files` as package-relative paths to contents.
 * Returns the root to hand to verifyExports().
 */
function fixtureRoot(packages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-exports-'));
  tempRoots.push(root);
  for (const [dir, {manifest, files = {}}] of Object.entries(packages)) {
    const pkgDir = path.join(root, 'packages', dir);
    fs.mkdirSync(pkgDir, {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify(manifest, null, 2),
    );
    for (const [file, contents] of Object.entries(files)) {
      const abs = path.join(pkgDir, file);
      fs.mkdirSync(path.dirname(abs), {recursive: true});
      fs.writeFileSync(abs, contents);
    }
  }
  return root;
}

/**
 * Write a single package directory and return its path, for the rules that take
 * a `pkgDir` directly. `files` maps package-relative paths to contents.
 */
function fixturePkg(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-exports-'));
  tempRoots.push(root);
  for (const [file, contents] of Object.entries(files)) {
    const abs = path.join(root, file);
    fs.mkdirSync(path.dirname(abs), {recursive: true});
    fs.writeFileSync(abs, contents);
  }
  return root;
}

/** A dist entry Node can load. */
const LOADABLE = 'export const value = 1;\n';

/**
 * A dist entry that exists but cannot be imported: a relative specifier
 * pointing at a file the build never emitted.
 */
const UNLOADABLE = "export * from './missing-chunk.js';\n";

/** The publish posture of the repo's canary packages (charts, lab, …). */
const canaryManifest = (name, extra = {}) => ({
  name,
  private: true,
  type: 'module',
  astryx: {canaryOnly: true},
  ...extra,
});

const labels = targets => targets.map(t => t.label);
const names = results => results.map(r => r.name);

describe('checkPackageExports — which targets get probed', () => {
  /** A built package: ESM and CJS entries, declarations, a stylesheet, assets. */
  const built = () =>
    fixturePkg({
      'dist/index.js': LOADABLE,
      'dist/index.mjs': LOADABLE,
      'dist/index.cjs': 'module.exports = {};\n',
      'dist/index.d.ts': 'export declare const value: number;\n',
      'dist/index.css': '.a{color:red}\n',
      'dist/locales/en.json': '{}\n',
      'src/index.ts': 'export const value = 1;\n',
    });

  it("probes a `default` target that is the export's only runtime condition", () => {
    // The charts/lab/richtext/core shape: no `import` condition at all, so
    // `default` is what a consumer's `import` actually resolves to.
    const {errors, targets} = checkPackageExports(
      built(),
      '@astryxdesign/fixture-pkg',
      {
        '.': {
          source: './src/index.ts',
          types: './dist/index.d.ts',
          default: './dist/index.js',
        },
      },
    );
    expect(errors).toEqual([]);
    expect(labels(targets)).toEqual(['exports["."].default']);
  });

  it('probes what an import resolves to, in declaration order', () => {
    // Node takes the first matching condition. With `import` first, the
    // `default` after it is unreachable for an import.
    const importFirst = checkPackageExports(
      built(),
      '@astryxdesign/fixture-pkg',
      {
        '.': {import: './dist/index.mjs', default: './dist/index.js'},
      },
    );
    expect(labels(importFirst.targets)).toEqual(['exports["."].import']);
    // With `default` first, `default` always matches, so it is what an import
    // loads, and the `import` after it is the unreachable one.
    const defaultFirst = checkPackageExports(
      built(),
      '@astryxdesign/fixture-pkg',
      {
        '.': {default: './dist/index.js', import: './dist/index.mjs'},
      },
    );
    expect(labels(defaultFirst.targets)).toEqual(['exports["."].default']);
  });

  it('follows a nested `node` branch the way Node does', () => {
    expect(
      resolveExportTarget(
        {node: {import: './dist/index.mjs'}, default: './dist/index.js'},
        'import',
      ),
    ).toEqual({value: './dist/index.mjs', conditions: ['node', 'import']});
    // A branch with no matching condition falls through to the next key.
    expect(
      resolveExportTarget(
        {browser: './dist/browser.js', default: './dist/index.js'},
        'import',
      ),
    ).toEqual({value: './dist/index.js', conditions: ['default']});
    expect(resolveExportTarget({types: './dist/index.d.ts'}, 'import')).toBe(
      null,
    );
  });

  it('loads a `default` nested under `require` with require', () => {
    const {targets} = checkPackageExports(
      built(),
      '@astryxdesign/fixture-pkg',
      {
        '.': {
          require: {types: './dist/index.d.ts', default: './dist/index.cjs'},
          import: './dist/index.mjs',
        },
      },
    );
    expect(targets.map(t => [t.label, t.loader])).toEqual([
      ['exports["."].import', 'import'],
      ['exports["."].require.default', 'require'],
    ]);
  });

  it('leaves non-runtime `default` targets alone — stylesheets and assets', () => {
    // charts/lab expose their CSS through `default`; Node cannot import it, so
    // the extension filter has to be what decides, not the condition name.
    const {errors, targets} = checkPackageExports(
      built(),
      '@astryxdesign/fixture-pkg',
      {
        './styles.css': {default: './dist/index.css'},
        './locales/*.json': './dist/locales/*.json',
        './cjs': {default: './dist/index.cjs'},
      },
    );
    expect(errors).toEqual([]);
    // A `.cjs` reached through `default` is a module an import loads.
    expect(labels(targets)).toEqual(['exports["./cjs"].default']);
  });

  it('probes the import and an explicit `require`, never `types`', () => {
    const {targets} = checkPackageExports(
      built(),
      '@astryxdesign/fixture-pkg',
      {
        '.': {
          types: './dist/index.d.ts',
          require: './dist/index.cjs',
          import: './dist/index.mjs',
        },
      },
    );
    expect(targets.map(t => [t.label, t.loader])).toEqual([
      ['exports["."].import', 'import'],
      ['exports["."].require', 'require'],
    ]);
  });

  it('reports a missing target instead of probing it', () => {
    const {errors, targets} = checkPackageExports(
      built(),
      '@astryxdesign/fixture-pkg',
      {
        '.': {default: './dist/never-built.js'},
      },
    );
    expect(errors).toEqual([
      '  ✗ exports["."].default → ./dist/never-built.js (file not found)',
    ]);
    expect(targets).toEqual([]);
  });
});

describe('verifyExports — package selection over a real tree', () => {
  it('skips a genuinely private package, even with a broken entry', () => {
    const root = fixtureRoot({
      internal: {
        manifest: {
          name: '@astryxdesign/fixture-internal',
          private: true,
          exports: {'.': {default: './dist/index.js'}},
        },
        files: {'dist/index.js': UNLOADABLE},
      },
    });
    const {results, targets} = verifyExports(root);
    expect(names(results)).toEqual([]);
    expect(targets).toEqual([]);
  });

  it('checks a canaryOnly package and collects its `default` entry', () => {
    const root = fixtureRoot({
      charts: {
        manifest: canaryManifest('@astryxdesign/fixture-charts', {
          main: './dist/index.js',
          exports: {
            '.': {
              source: './src/index.ts',
              types: './dist/index.d.ts',
              default: './dist/index.js',
            },
            './charts.css': {default: './dist/charts.css'},
          },
        }),
        files: {
          'dist/index.js': LOADABLE,
          'dist/index.d.ts': 'export declare const value: number;\n',
          'dist/charts.css': '.a{color:red}\n',
        },
      },
    });
    const {results, targets} = verifyExports(root);
    expect(names(results)).toEqual(['@astryxdesign/fixture-charts']);
    expect(results[0].errors).toEqual([]);
    // The stylesheet is reached through `default` too, and stays unprobed.
    expect(labels(targets)).toEqual(['exports["."].default']);
  });

  it('fails a canary package whose runtime entry cannot be imported', () => {
    // The regression: on the unfixed gate this tree passed clean.
    const root = fixtureRoot({
      charts: {
        manifest: canaryManifest('@astryxdesign/fixture-charts', {
          exports: {
            '.': {types: './dist/index.d.ts', default: './dist/index.js'},
          },
        }),
        files: {
          'dist/index.js': UNLOADABLE,
          'dist/index.d.ts': 'export declare const value: number;\n',
        },
      },
    });
    const {results, targets} = verifyExports(root);
    // Every path exists, so the existence pass is clean — only loading it fails.
    expect(results[0].errors).toEqual([]);
    expect(targets).toHaveLength(1);

    const failures = probeLoadTargets(targets);
    expect(failures).toHaveLength(1);
    expect(failures[0].code).toBe('ERR_MODULE_NOT_FOUND');
  });

  it('passes a canary package whose `default`-only entry loads', () => {
    const root = fixtureRoot({
      lab: {
        manifest: canaryManifest('@astryxdesign/fixture-lab', {
          exports: {'.': {default: './dist/index.js'}},
        }),
        files: {'dist/index.js': LOADABLE},
      },
    });
    const {results, targets} = verifyExports(root);
    expect(results[0].errors).toEqual([]);
    expect(probeLoadTargets(targets)).toEqual([]);
  });

  it('keeps reporting a canary package that points at a file it never built', () => {
    const root = fixtureRoot({
      charts: {
        manifest: canaryManifest('@astryxdesign/fixture-charts', {
          main: './dist/index.js',
          exports: {'.': {default: './dist/index.js'}},
        }),
      },
    });
    const {results} = verifyExports(root);
    expect(results[0].errors).toEqual([
      '  ✗ main → ./dist/index.js (file not found)',
      '  ✗ exports["."].default → ./dist/index.js (file not found)',
    ]);
  });

  it('fails a `.js` entry with module syntax whose package does not say "type": "module"', () => {
    // Node's syntax detection would load this file by its URL; a consumer that
    // resolves it through the package, or a bundler, reads it as CommonJS.
    const shape = type =>
      fixtureRoot({
        charts: {
          manifest: canaryManifest('@astryxdesign/fixture-charts', {
            type,
            exports: {
              '.': {types: './dist/index.d.ts', default: './dist/index.js'},
            },
          }),
          files: {
            'dist/index.js': LOADABLE,
            'dist/index.d.ts': 'export declare const value: number;\n',
          },
        },
      });
    const missing = verifyExports(shape());
    expect(missing.results[0].errors).toEqual([]);
    expect(probeLoadTargets(missing.targets)).toEqual([
      expect.objectContaining({
        label: 'exports["."].default',
        code: 'ERR_MISSING_TYPE_MODULE',
      }),
    ]);
    expect(probeLoadTargets(verifyExports(shape('module')).targets)).toEqual(
      [],
    );
  });

  it('fails a broken `default` that Node takes before a working `import`', () => {
    const root = fixtureRoot({
      lab: {
        manifest: canaryManifest('@astryxdesign/fixture-lab', {
          type: 'module',
          exports: {
            '.': {default: './dist/index.js', import: './dist/index.mjs'},
          },
        }),
        files: {'dist/index.js': UNLOADABLE, 'dist/index.mjs': LOADABLE},
      },
    });
    const {targets} = verifyExports(root);
    expect(probeLoadTargets(targets)).toEqual([
      expect.objectContaining({
        label: 'exports["."].default',
        code: 'ERR_MODULE_NOT_FOUND',
      }),
    ]);
  });

  it('reports other syntax errors as they are, not as a missing type', () => {
    const root = fixtureRoot({
      lab: {
        manifest: canaryManifest('@astryxdesign/fixture-lab', {
          type: undefined,
          exports: {'.': {default: './dist/index.js'}},
        }),
        files: {'dist/index.js': 'export const = ;\n'},
      },
    });
    const failures = probeLoadTargets(verifyExports(root).targets);
    expect(failures.map(f => f.code)).not.toContain('ERR_MISSING_TYPE_MODULE');
  });

  it('skips a package npm does not receive, as the canary loops do', () => {
    const root = fixtureRoot({
      tooling: {
        manifest: {name: '@other/tooling', exports: {'.': './dist/index.js'}},
        files: {'dist/index.js': UNLOADABLE},
      },
    });
    expect(verifyExports(root).results).toEqual([]);
  });

  it('keeps import, require and source handling', () => {
    const root = fixtureRoot({
      vega: {
        manifest: {
          name: '@astryxdesign/fixture-vega',
          exports: {
            '.': {
              source: './src/index.ts',
              types: './dist/index.d.ts',
              import: './dist/index.mjs',
              require: './dist/index.js',
            },
          },
        },
        files: {
          'dist/index.mjs': LOADABLE,
          'dist/index.js': 'module.exports = {};\n',
          'dist/index.d.ts': 'export declare const value: number;\n',
        },
      },
    });
    const {results, targets} = verifyExports(root);
    // `source` points at a file that does not exist here and is still skipped.
    expect(results[0].errors).toEqual([]);
    expect(labels(targets)).toEqual([
      'exports["."].import',
      'exports["."].require',
    ]);
    expect(probeLoadTargets(targets)).toEqual([]);
  });
});

describe('the real workspace manifests', () => {
  /** Every package.json directly under packages/. */
  const manifests = fs
    .readdirSync(path.join(ROOT, 'packages'), {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(ROOT, 'packages', entry.name, 'package.json'))
    .filter(file => fs.existsSync(file))
    .map(file => JSON.parse(fs.readFileSync(file, 'utf-8')));

  /**
   * Run a real export map through the rules without needing a built tree: every
   * string target is stubbed on disk first, so what is asserted is the rules'
   * verdict on shipped manifest data, not whether `pnpm build` has run. The
   * `node` project's globalSetup builds core, but nothing builds the canary
   * packages before `pnpm test`.
   */
  function targetsFor(pkg) {
    const stubs = {};
    const collect = value => {
      if (typeof value === 'string') {
        if (!value.includes('*')) stubs[value] = LOADABLE;
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(collect);
      }
    };
    collect(pkg.exports);
    return checkPackageExports(fixturePkg(stubs), pkg.name, pkg.exports)
      .targets;
  }

  it('covers every canaryOnly package in packages/', () => {
    const canaries = manifests.filter(pkg => pkg.astryx?.canaryOnly === true);

    expect(canaries.length).toBeGreaterThan(0);
    for (const pkg of canaries) {
      expect(isPublished(pkg), pkg.name).toBe(true);
    }
  });

  it("probes the `default` entries that are core's real import surface", () => {
    const core = manifests.find(pkg => pkg.name === '@astryxdesign/core');
    const targets = targetsFor(core);
    // Core routes every subpath through `default`.
    expect(targets.length).toBeGreaterThan(2);
    expect(
      targets.filter(t => t.label.endsWith('.default')).length,
    ).toBeGreaterThan(2);
    expect(targets.every(t => /\.(js|mjs)$/.test(t.value))).toBe(true);
  });

  it('probes a runtime entry for every canaryOnly package', () => {
    // The canary packages expose `.` only through `default`; if the rule
    // stopped following it, their entry points would go unprobed.
    for (const pkg of manifests.filter(p => p.astryx?.canaryOnly === true)) {
      expect(targetsFor(pkg).length, pkg.name).toBeGreaterThan(0);
    }
  });

  it('never probes a stylesheet, declaration or asset', () => {
    for (const pkg of manifests.filter(p => p.exports)) {
      expect(
        targetsFor(pkg).filter(
          t => /\.(css|json)$/.test(t.value) || t.value.endsWith('.d.ts'),
        ),
        pkg.name,
      ).toEqual([]);
    }
  });
});
