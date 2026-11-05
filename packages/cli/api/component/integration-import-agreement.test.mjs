// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The import specifier an integration component is reported under has to
 * be the SAME at every surface, and it has to resolve.
 *
 * `component` reports it as ownership metadata and `search` reports it on every
 * hit. Each used to resolve it independently, and they disagreed: `component`
 * honored a doc-authored `import` and otherwise derived the subpath from the
 * doc's directory against the owning package's `exports`, while `search` handed
 * back the bare package name — a specifier that does not resolve for a package
 * whose components live behind subpaths. An agent that searched and then
 * imported what it was told got a broken file.
 *
 * The two now share one resolver and one precedence rule, so the agreement is
 * structural. These tests pin the property rather than the implementation: ask
 * both surfaces about the same component and require the same answer, across
 * every shape a real package's `exports` takes.
 *
 * Fixtures live under a repo-local temp dir, not /tmp, because Vite refuses to
 * dynamically import a module from outside the project root.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {component} from './component.mjs';
import {search} from '../search/search.mjs';
import {resolveIntegrationImportPath} from '../../foundation/discovery/component-discovery.mjs';

const SLOW = 30_000;

let tmpDir;

/**
 * A consumer project with one configured integration that ships a single
 * component, `AcmeCarousel`, in a directory named after the concept rather
 * than after the component — the shape real packages use when one entry point
 * exports several components, and the case the bare-package answer got wrong.
 *
 * @param {object} [options]
 * @param {Record<string, string>} [options.exports] the owning package's
 *   `exports` map; omit it for a package that publishes no subpaths.
 * @param {string} [options.docImport] an `import` the component's doc states
 *   for itself, which is canonical and must win over any resolved subpath.
 */
function scaffold({exports: exportsMap, docImport} = {}) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/widgets']};\n",
  );

  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  const componentDir = path.join(pkgDir, 'src', 'Carousel');
  fs.mkdirSync(componentDir, {recursive: true});

  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name: '@acme/widgets',
      version: '1.0.0',
      ...(exportsMap ? {exports: exportsMap} : {}),
    }),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './src'};\n",
  );
  fs.writeFileSync(
    path.join(componentDir, 'AcmeCarousel.tsx'),
    'export const AcmeCarousel = () => null;\n',
  );
  fs.writeFileSync(
    path.join(componentDir, 'AcmeCarousel.doc.mjs'),
    `export const docs = ${JSON.stringify(
      {
        type: 'component',
        name: 'AcmeCarousel',
        displayName: 'Acme Carousel',
        keywords: ['carousel', 'slides'],
        usage: {description: 'A carousel that cycles through slides.'},
        props: [],
        ...(docImport ? {import: docImport} : {}),
      },
      null,
      2,
    )};\n`,
  );
}

/** The import `search` reports for a named component, or null. */
function searchImportFor(result, name) {
  for (const group of Object.values(result.data ?? {})) {
    if (!Array.isArray(group)) continue;
    const hit = group.find(entry => entry?.name === name);
    if (hit) return hit.import ?? null;
  }
  return null;
}

/** Both surfaces' answer for AcmeCarousel, as `{detail, found}`. */
async function bothSurfaces() {
  const detail = await component('AcmeCarousel', {cwd: tmpDir});
  const found = await search('carousel', {cwd: tmpDir});
  return {
    detail: detail.data.import,
    found: searchImportFor(found, 'AcmeCarousel'),
  };
}

const SUBPATH_EXPORTS = {
  '.': './src/index.js',
  './Carousel': './src/Carousel/index.js',
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(process.cwd(), '.astryx-import-agreement-test-'),
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integration component import specifiers', () => {
  it(
    'component and search report the same import for the same component',
    async () => {
      scaffold({exports: SUBPATH_EXPORTS});
      const {detail, found} = await bothSurfaces();

      expect(detail).toBe('@acme/widgets/Carousel');
      expect(found).toBe(detail);
    },
    SLOW,
  );

  it(
    'neither surface reports the bare package when a subpath is exported',
    async () => {
      scaffold({exports: SUBPATH_EXPORTS});
      const {detail, found} = await bothSurfaces();

      expect(detail).not.toBe('@acme/widgets');
      expect(found).not.toBe('@acme/widgets');
    },
    SLOW,
  );

  it(
    'both fall back to the package root when it exports no matching subpath',
    async () => {
      scaffold();
      const {detail, found} = await bothSurfaces();

      // The bare package is the honest answer here: it is what a consumer
      // would have to write by hand. What matters is that both agree on it.
      expect(detail).toBe('@acme/widgets');
      expect(found).toBe('@acme/widgets');
    },
    SLOW,
  );

  it(
    'a doc-authored import wins at both surfaces, over any resolved subpath',
    async () => {
      // The alias case: the package canonically publishes this component under
      // a name that is not its directory, and says so in its doc. Resolving the
      // directory would produce `/Carousel`, which is why the two surfaces have
      // to share the precedence rule and not just the resolver.
      scaffold({exports: SUBPATH_EXPORTS, docImport: '@acme/widgets/Alias'});
      const {detail, found} = await bothSurfaces();

      expect(detail).toBe('@acme/widgets/Alias');
      expect(found).toBe(detail);
    },
    SLOW,
  );

  it(
    'a doc-authored import is honored even with no exports map at all',
    async () => {
      scaffold({docImport: '@acme/widgets/Alias'});
      const {detail, found} = await bothSurfaces();

      expect(detail).toBe('@acme/widgets/Alias');
      expect(found).toBe(detail);
    },
    SLOW,
  );

  it(
    'a wildcard exports map resolves to the exported subpath at both surfaces',
    async () => {
      // `./*` publishes `./Carousel` exactly as a literal key would, so the
      // subpath is the correct answer. An earlier version of this test asserted
      // only that the two surfaces AGREED, and both agreed on the bare package
      // — a specifier that need not resolve at all here, since this package
      // publishes no `.` export. Agreement is necessary and not sufficient.
      scaffold({exports: {'./*': './src/*/index.js'}});
      const {detail, found} = await bothSurfaces();

      expect(detail).toBe('@acme/widgets/Carousel');
      expect(found).toBe(detail);
    },
    SLOW,
  );

  it(
    'a wildcard whose target is null does not publish the subpath',
    async () => {
      // `null` blocks a subpath rather than publishing it, so the honest answer
      // is the package root at both surfaces.
      scaffold({exports: {'.': './src/index.js', './*': null}});
      const {detail, found} = await bothSurfaces();

      expect(detail).toBe('@acme/widgets');
      expect(found).toBe(detail);
    },
    SLOW,
  );

  it(
    'a prefixed wildcard only matches the subpaths it covers',
    async () => {
      // `./components/*` does not cover `./Carousel`, so this falls back.
      scaffold({
        exports: {'.': './src/index.js', './components/*': './src/*/index.js'},
      });
      const {detail, found} = await bothSurfaces();

      expect(detail).toBe('@acme/widgets');
      expect(found).toBe(detail);
    },
    SLOW,
  );

  it(
    'an exact key still wins where a wildcard would also match',
    async () => {
      scaffold({
        exports: {
          '.': './src/index.js',
          './Carousel': './src/Carousel/index.js',
          './*': './src/*/index.js',
        },
      });
      const {detail, found} = await bothSurfaces();

      expect(detail).toBe('@acme/widgets/Carousel');
      expect(found).toBe(detail);
    },
    SLOW,
  );

  it(
    'one matching pattern among several is enough',
    async () => {
      scaffold({
        exports: {
          '.': './src/index.js',
          './blocks/*': './src/blocks/*.js',
          './*': './src/*/index.js',
          './themes/*': './themes/*.css',
        },
      });
      const {detail, found} = await bothSurfaces();

      expect(detail).toBe('@acme/widgets/Carousel');
      expect(found).toBe(detail);
    },
    SLOW,
  );

  it(
    'a conditional export object still counts as published',
    async () => {
      // The target may be a conditions object rather than a string; what
      // matters for a specifier is that the subpath is published at all.
      scaffold({
        exports: {
          '.': './src/index.js',
          './Carousel': {
            import: './src/Carousel/index.js',
            require: './cjs/Carousel.js',
          },
        },
      });
      const {detail, found} = await bothSurfaces();

      expect(detail).toBe('@acme/widgets/Carousel');
      expect(found).toBe(detail);
    },
    SLOW,
  );

  it('resolves from disk for a record that carries no parsed exports map', () => {
    // `loadIntegrations` parses the map onto every integration it loads, but a
    // record built by hand — as several tests and callers do — has no such
    // field. Resolution must read the manifest rather than quietly reporting
    // the bare package, because a silent degradation is how the original bug
    // reached users. `undefined` means "nobody parsed it"; `null` means the
    // loader looked and there was none.
    scaffold({exports: SUBPATH_EXPORTS});
    const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
    const docPath = path.join(
      pkgDir,
      'src',
      'Carousel',
      'AcmeCarousel.doc.mjs',
    );

    expect(
      resolveIntegrationImportPath(
        {packageDir: pkgDir, docPath, packageName: '@acme/widgets'},
        'AcmeCarousel',
      ),
    ).toBe('@acme/widgets/Carousel');

    // A parsed `null` is an answer, not a gap: it must not fall back to a read.
    expect(
      resolveIntegrationImportPath(
        {
          exportsMap: null,
          packageDir: pkgDir,
          docPath,
          packageName: '@acme/widgets',
        },
        'AcmeCarousel',
      ),
    ).toBe('@acme/widgets');
  });
});

/**
 * Scaffold a default-export component doc (the shape `integration add component`
 * generates). This is a separate function because the existing scaffold writes
 * a named `export const docs`, and we need to test both.
 */
function scaffoldDefaultExport({exports: exportsMap, docImport} = {}) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/widgets']};\n",
  );

  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  const componentDir = path.join(pkgDir, 'src', 'Carousel');
  fs.mkdirSync(componentDir, {recursive: true});

  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name: '@acme/widgets',
      version: '1.0.0',
      ...(exportsMap ? {exports: exportsMap} : {}),
    }),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './src'};\n",
  );
  fs.writeFileSync(
    path.join(componentDir, 'AcmeCarousel.tsx'),
    'export const AcmeCarousel = () => null;\n',
  );
  // Default export — the shape integration add component writes
  fs.writeFileSync(
    path.join(componentDir, 'AcmeCarousel.doc.mjs'),
    `export default ${JSON.stringify(
      {
        type: 'component',
        name: 'AcmeCarousel',
        displayName: 'Acme Carousel',
        keywords: ['carousel', 'slides'],
        usage: {description: 'A carousel that cycles through slides.'},
        props: [],
        ...(docImport ? {import: docImport} : {}),
      },
      null,
      2,
    )};\n`,
  );
}

describe('default-export component doc agreement', () => {
  it(
    'component detail loads a default-export doc without crashing',
    async () => {
      scaffoldDefaultExport({exports: SUBPATH_EXPORTS});
      const result = await component('AcmeCarousel', {cwd: tmpDir});
      expect(result.type).toBe('component.detail');
      expect(result.data.name).toBe('AcmeCarousel');
      expect(result.data.import).toBe('@acme/widgets/Carousel');
      expect(result.data.package).toBe('@acme/widgets');
    },
    SLOW,
  );

  it(
    'a doc-authored import in a default export wins over the resolved subpath',
    async () => {
      scaffoldDefaultExport({
        exports: SUBPATH_EXPORTS,
        docImport: '@acme/widgets/Alias',
      });
      const result = await component('AcmeCarousel', {cwd: tmpDir});
      expect(result.data.import).toBe('@acme/widgets/Alias');
    },
    SLOW,
  );

  it(
    'search finds a default-export component with the correct import',
    async () => {
      scaffoldDefaultExport({exports: SUBPATH_EXPORTS});
      const found = await search('carousel', {cwd: tmpDir});
      const hit = searchImportFor(found, 'AcmeCarousel');
      expect(hit).toBe('@acme/widgets/Carousel');
    },
    SLOW,
  );

  it(
    'component and search agree on a default-export component',
    async () => {
      scaffoldDefaultExport({exports: SUBPATH_EXPORTS});
      const {detail, found} = await bothSurfaces();
      expect(detail).toBe('@acme/widgets/Carousel');
      expect(found).toBe(detail);
    },
    SLOW,
  );

  it(
    'list includes the integration import for a default-export component',
    async () => {
      scaffoldDefaultExport({exports: SUBPATH_EXPORTS});
      const result = await component(undefined, {cwd: tmpDir, list: true});
      expect(result.type).toBe('component.list');
      const allEntries = Object.values(result.data.components).flat();
      const entry = allEntries.find(e => e.name === 'AcmeCarousel');
      expect(entry).toBeDefined();
      expect(entry.package).toBe('@acme/widgets');
      // The import must be the integration subpath, not a core path.
      expect(/** @type {any} */ (entry).import).toBe('@acme/widgets/Carousel');
    },
    SLOW,
  );

  it(
    'list honors a default-export component doc import alias',
    async () => {
      scaffoldDefaultExport({
        exports: SUBPATH_EXPORTS,
        docImport: '@acme/widgets/Alias',
      });
      const result = await component(undefined, {cwd: tmpDir, list: true});
      expect(result.type).toBe('component.list');
      const allEntries = Object.values(result.data.components).flat();
      const entry = allEntries.find(e => e.name === 'AcmeCarousel');
      expect(/** @type {any} */ (entry).import).toBe('@acme/widgets/Alias');
    },
    SLOW,
  );
});
