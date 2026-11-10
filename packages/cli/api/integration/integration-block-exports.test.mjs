// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Proves the minimal `exports` recipe an integration package needs so a
 * bundler-resolution consumer can `import()` its block templates AND type-check
 * them under `moduleResolution: bundler`.
 *
 * Integration packages in this ecosystem ship TypeScript SOURCE — their block
 * templates are `.tsx` files with no compiled `.d.ts`. A later feature renders
 * showcase previews by a REAL dynamic `import()` of a block's `.tsx` source
 * (e.g. `import('@acme/widgets/templates/Gauge/GaugeShowcase.tsx')`) instead of
 * eval'ing source text. For that import to resolve, the integration's
 * `package.json#exports` map must GATE the deep path.
 *
 * These tests stand up a throwaway `@acme/widgets` fixture and drive the two
 * gates that matter with the repo's own toolchain:
 *   1. `tsc --noEmit` under `moduleResolution: bundler` (the consumer profile
 *      used by the Next.js example apps — NO `allowImportingTsExtensions`).
 *   2. `esbuild --bundle` (a real bundler resolving + loading the deep import).
 *
 * CANONICAL RECIPE (see integration-authoring.md):
 *   exports: { "./templates/*.tsx": "./templates/*.tsx" }
 *   import:  import('@acme/widgets/templates/<Name>/<Name>Showcase.tsx')   // WITH .tsx
 *
 * The negative controls lock in WHY the extension is required: a bare
 * `./templates/*` export with an extensionless import fails to type-check under
 * bundler resolution (TS cannot infer the `.tsx` extension for a deep
 * specifier), and an extensionless import fails to bundle.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const require = createRequire(import.meta.url);

/** Resolve the workspace tsc/esbuild binaries; null if unavailable. */
function resolveBin(spec) {
  try {
    return require.resolve(spec);
  } catch {
    return null;
  }
}
const TSC_BIN = resolveBin('typescript/bin/tsc');
const ESBUILD_BIN = resolveBin('esbuild/bin/esbuild');

let tmpDir;

/**
 * Where an esbuild case's consumer lives: under the repository's
 * `node_modules/.cache`. esbuild reads the listing of every directory above
 * each file it bundles, and on a shared machine the system temp directory can
 * hold hundreds of thousands of entries, which cost more than the bundle. tsc's
 * cases stay in the system temp directory, where no `node_modules/@types`
 * above the consumer adds types it never installed.
 */
const BUNDLER_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../node_modules/.cache/astryx-block-exports',
);

/** A fresh consumer project under `root`: its package.json and tsconfig. */
function createConsumer(root) {
  fs.mkdirSync(root, {recursive: true});
  tmpDir = fs.mkdtempSync(path.join(root, 'astryx-block-exports-'));
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', private: true, type: 'module'}),
  );
  writeTsconfig();
}

/** Moves the consumer for an esbuild case under BUNDLER_ROOT. */
function useBundlerRoot() {
  fs.rmSync(tmpDir, {recursive: true, force: true});
  createConsumer(BUNDLER_ROOT);
}

/**
 * Build an @acme/widgets fixture: a block template (released `.template.ts` compatibility descriptor +
 * same-stem `.tsx` source) under `templates/`, plus an astryx.integration
 * manifest, plus a caller-supplied `exports` map.
 * @param {Record<string, string> | undefined} exportsMap
 */
function makeWidgets(exportsMap) {
  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  const blockDir = path.join(pkgDir, 'templates', 'Gauge');
  fs.mkdirSync(blockDir, {recursive: true});

  const pkg = {name: '@acme/widgets', version: '2.0.0', type: 'module'};
  if (exportsMap) pkg.exports = exportsMap;
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify(pkg, null, 2),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default { templates: './templates' };\n`,
  );
  // The released `.template.*` compatibility form remains resolvable.
  fs.writeFileSync(
    path.join(blockDir, 'GaugeShowcase.template.ts'),
    `export default { name: 'Gauge showcase', description: 'A gauge.' };\n`,
  );
  // The same-stem `.tsx` SOURCE that a preview will dynamically import().
  // Returns a plain value so the fixture type-checks without React types.
  fs.writeFileSync(
    path.join(blockDir, 'GaugeShowcase.tsx'),
    `const GaugeShowcase = (): string => 'gauge-showcase';\n` +
      `export default GaugeShowcase;\n`,
  );
  return pkgDir;
}

/** Write a consumer that dynamically imports the given specifier. */
function writeConsumer(specifier) {
  fs.writeFileSync(
    path.join(tmpDir, 'consumer.ts'),
    `const load = () => import('${specifier}');\nexport default load;\n`,
  );
}

/**
 * The realistic consumer tsconfig: matches the repo's Next.js example apps
 * (`moduleResolution: bundler`, `noEmit`, and deliberately NO
 * `allowImportingTsExtensions`).
 */
function writeTsconfig() {
  fs.writeFileSync(
    path.join(tmpDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          skipLibCheck: true,
          esModuleInterop: true,
          noEmit: true,
          isolatedModules: true,
        },
        include: ['consumer.ts'],
      },
      null,
      2,
    ),
  );
}

/** @returns {{ok: boolean, out: string}} */
function runTsc() {
  try {
    execFileSync(
      process.execPath,
      [TSC_BIN, '--noEmit', '-p', 'tsconfig.json'],
      {
        cwd: tmpDir,
        stdio: 'pipe',
      },
    );
    return {ok: true, out: ''};
  } catch (e) {
    return {ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`};
  }
}

/** @returns {{ok: boolean, out: string}} */
function runEsbuild() {
  try {
    // esbuild's bin is a native executable (not a node script), so invoke it
    // directly rather than through process.execPath.
    execFileSync(
      ESBUILD_BIN,
      [
        'consumer.ts',
        '--bundle',
        '--format=esm',
        '--loader:.tsx=tsx',
        '--outfile=/dev/null',
        '--log-level=error',
      ],
      {cwd: tmpDir, stdio: 'pipe'},
    );
    return {ok: true, out: ''};
  } catch (e) {
    return {ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}`};
  }
}

beforeEach(() => {
  createConsumer(os.tmpdir());
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

const CANONICAL = 'import(@acme/widgets/templates/Gauge/GaugeShowcase.tsx)';
const SPEC = '@acme/widgets/templates/Gauge/GaugeShowcase.tsx';

describe('integration block-template exports recipe', () => {
  it('has at least one real resolver available', () => {
    expect(TSC_BIN ?? ESBUILD_BIN).not.toBeNull();
  });

  it.runIf(TSC_BIN != null)(
    `CANONICAL: exports {"./templates/*.tsx"} + ${CANONICAL} type-checks under bundler resolution`,
    () => {
      makeWidgets({'./templates/*.tsx': './templates/*.tsx'});
      writeConsumer(SPEC);
      const {ok, out} = runTsc();
      expect(out).toBe('');
      expect(ok).toBe(true);
    },
    30_000,
  );

  it.runIf(ESBUILD_BIN != null)(
    `CANONICAL: the same import resolves + bundles with a real bundler`,
    () => {
      useBundlerRoot();
      makeWidgets({'./templates/*.tsx': './templates/*.tsx'});
      writeConsumer(SPEC);
      const {ok, out} = runEsbuild();
      expect(out).toBe('');
      expect(ok).toBe(true);
    },
    30_000,
  );

  it.runIf(TSC_BIN != null)(
    'NEGATIVE: an extensionless import does NOT type-check (TS cannot infer .tsx)',
    () => {
      makeWidgets({'./templates/*.tsx': './templates/*.tsx'});
      writeConsumer('@acme/widgets/templates/Gauge/GaugeShowcase');
      const {ok, out} = runTsc();
      expect(ok).toBe(false);
      expect(out).toContain('TS2307');
    },
    30_000,
  );

  it.runIf(TSC_BIN != null)(
    'NEGATIVE: a bare "./templates/*" export (no .tsx entry) does NOT type-check the .tsx import',
    () => {
      // Only a bare mapping — the extensionful subpath is not exported.
      makeWidgets({'./templates/*': './templates/*'});
      writeConsumer(SPEC);
      const {ok, out} = runTsc();
      expect(ok).toBe(false);
      // Bare export forces the TS5097 opt-in requirement (allowImportingTsExtensions).
      expect(out).toContain('TS5097');
    },
    30_000,
  );

  it.runIf(ESBUILD_BIN != null)(
    'NEGATIVE: an extensionless import does NOT bundle against the .tsx-only export',
    () => {
      useBundlerRoot();
      makeWidgets({'./templates/*.tsx': './templates/*.tsx'});
      writeConsumer('@acme/widgets/templates/Gauge/GaugeShowcase');
      const {ok} = runEsbuild();
      expect(ok).toBe(false);
    },
    30_000,
  );
});
