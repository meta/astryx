// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {
  FIXTURE_ASSET_MAX_BYTES,
  FIXTURE_ASSETS_TOTAL_MAX_BYTES,
  FIXTURE_IDS,
  FIXTURES_ROOT,
  RECIPES_ROOT,
  copyFixture,
  readRecipe,
  sha256File,
  validateCanonicalSuite,
  validateDeterministicContent,
  validateFixture,
  validateFixtureGallery,
  validatePackageJson,
  validateProvenance,
  validateTarballIsolation,
  validateWorkspaceIsolation,
} from './fixture-suite.mjs';

const temporaryDirectories = [];

function sandboxFor(fixtureId) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-suite-test-'));
  temporaryDirectories.push(parent);
  const sandbox = path.join(parent, fixtureId);
  copyFixture(fixtureId, sandbox);
  return sandbox;
}

function cloneRecipe(fixtureId) {
  return structuredClone(readRecipe(fixtureId));
}

function updateHash(recipe, fixtureRoot, relativeFile) {
  recipe.manifest.files[relativeFile] = sha256File(
    path.join(fixtureRoot, relativeFile),
  );
}

afterAll(() => {
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

describe('canonical fixture suite', () => {
  it('validates provenance, manifests, hashes, package pins, and isolation', () => {
    expect(() => validateCanonicalSuite()).not.toThrow();
  });

  it('copies a canonical fixture file-by-file without changing its source', () => {
    const fixtureId = FIXTURE_IDS[0];
    const sourcePackage = path.join(FIXTURES_ROOT, fixtureId, 'package.json');
    const sourceHash = sha256File(sourcePackage);
    const sandbox = sandboxFor(fixtureId);

    fs.appendFileSync(path.join(sandbox, 'package.json'), '\n');

    expect(sha256File(sourcePackage)).toBe(sourceHash);
  });

  it('rejects incomplete provenance', () => {
    const recipe = cloneRecipe(FIXTURE_IDS[0]);
    recipe.source = '';
    expect(() => validateProvenance(recipe)).toThrow(
      /missing provenance field source/,
    );
  });

  it('rejects a canonical byte mutation through its hash', () => {
    const fixtureId = FIXTURE_IDS[0];
    const sandbox = sandboxFor(fixtureId);
    fs.appendFileSync(path.join(sandbox, 'src', 'App.tsx'), '\n// changed\n');

    expect(() =>
      validateFixture({
        fixtureId,
        fixtureRoot: sandbox,
        recipe: readRecipe(fixtureId),
      }),
    ).toThrow(/hash mismatch for src\/App\.tsx/);
  });

  it('rejects an unmanifested canonical file', () => {
    const fixtureId = FIXTURE_IDS[0];
    const recipe = readRecipe(fixtureId);
    const actualFiles = [
      ...Object.keys(recipe.manifest.files),
      'unexpected.txt',
    ];

    expect(() =>
      validateFixture({
        fixtureId,
        fixtureRoot: path.join(FIXTURES_ROOT, fixtureId),
        recipe,
        actualFiles,
      }),
    ).toThrow(/manifest file list does not match/);
  });

  it.each([
    ['current time', 'const value = Date.now();'],
    ['random value', 'const value = Math.random();'],
    ['network access', "fetch('/data.json');"],
  ])('rejects %s in fixture source', (label, source) => {
    expect(() => validateDeterministicContent('mutated.ts', source)).toThrow(
      label,
    );
  });

  it('rejects a preinstalled Astryx package', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(
        path.join(FIXTURES_ROOT, FIXTURE_IDS[0], 'package.json'),
        'utf8',
      ),
    );
    packageJson.dependencies['@astryxdesign/core'] = '1.0.0';

    expect(() => validatePackageJson(FIXTURE_IDS[0], packageJson)).toThrow(
      /Astryx must not be preinstalled/,
    );
  });

  it('rejects removal of the explicit workspace exclusion', () => {
    expect(() =>
      validateWorkspaceIsolation(
        ['apps/*', 'packages/*', 'internal/*'],
        [],
        FIXTURES_ROOT,
      ),
    ).toThrow(/explicitly exclude canonical fixtures/);
  });

  it('rejects a fixture discovered as a workspace package', () => {
    expect(() =>
      validateWorkspaceIsolation(
        ['internal/*', '!internal/vibe-tests/fixtures/**'],
        [path.join(FIXTURES_ROOT, FIXTURE_IDS[0])],
        FIXTURES_ROOT,
      ),
    ).toThrow(/entered workspace package discovery/);
  });

  it('rejects a fixture under a publishable tarball root', () => {
    expect(() =>
      validateTarballIsolation(FIXTURES_ROOT, [
        {path: path.dirname(FIXTURES_ROOT), private: false},
      ]),
    ).toThrow(/inside publishable tarball root/);
  });

  it('rejects extra control semantics even with a refreshed hash', () => {
    const fixtureId = 'tailwind-v4-control';
    const sandbox = sandboxFor(fixtureId);
    const cssFile = path.join(sandbox, 'src', 'index.css');
    fs.appendFileSync(cssFile, '\n@theme inline { --color-card: #fff; }\n');
    const recipe = cloneRecipe(fixtureId);
    updateHash(recipe, sandbox, 'src/index.css');

    expect(() =>
      validateFixture({fixtureId, fixtureRoot: sandbox, recipe}),
    ).toThrow(/only background\/foreground semantic colors/);
  });

  it('rejects a shadcn-style fixture without its dark token set', () => {
    const fixtureId = 'shadcn-tailwind-v4-established';
    const sandbox = sandboxFor(fixtureId);
    const cssFile = path.join(sandbox, 'src', 'index.css');
    const css = fs.readFileSync(cssFile, 'utf8').replace('.dark {', '.night {');
    fs.writeFileSync(cssFile, css);
    const recipe = cloneRecipe(fixtureId);
    updateHash(recipe, sandbox, 'src/index.css');

    expect(() =>
      validateFixture({fixtureId, fixtureRoot: sandbox, recipe}),
    ).toThrow(/missing Tailwind v4 light\/dark theme structure/);
  });

  it('rejects an enterprise fixture without its guest boundary', () => {
    const fixtureId = 'enterprise-scoped-synthetic';
    const sandbox = sandboxFor(fixtureId);
    const appFile = path.join(sandbox, 'src', 'App.tsx');
    const app = fs
      .readFileSync(appFile, 'utf8')
      .replaceAll('data-guest-design-system', 'data-guest');
    fs.writeFileSync(appFile, app);
    const recipe = cloneRecipe(fixtureId);
    updateHash(recipe, sandbox, 'src/App.tsx');

    expect(() =>
      validateFixture({fixtureId, fixtureRoot: sandbox, recipe}),
    ).toThrow(/missing data-guest-design-system boundary surface/);
  });

  it('rejects a missing stable host probe even with a refreshed hash', () => {
    const fixtureId = 'shadcn-tailwind-v4-established';
    const sandbox = sandboxFor(fixtureId);
    const appFile = path.join(sandbox, 'src', 'App.tsx');
    const app = fs
      .readFileSync(appFile, 'utf8')
      .replace(
        'data-vibe-probe="primary-action"',
        'data-host-probe="primary-action"',
      );
    fs.writeFileSync(appFile, app);
    const recipe = cloneRecipe(fixtureId);
    updateHash(recipe, sandbox, 'src/App.tsx');

    expect(() =>
      validateFixture({fixtureId, fixtureRoot: sandbox, recipe}),
    ).toThrow(/stable host probe markers/);
  });

  it.each([
    ['shadcn-tailwind-v4-established', 'tooltip-surface'],
    ['enterprise-scoped-synthetic', 'popover-surface'],
  ])(
    'rejects %s when nested overlay coverage is removed',
    (fixtureId, marker) => {
      const sandbox = sandboxFor(fixtureId);
      const appFile = path.join(sandbox, 'src', 'App.tsx');
      const app = fs
        .readFileSync(appFile, 'utf8')
        .replace(`data-vibe-probe="${marker}"`, `data-overlay="${marker}"`);
      fs.writeFileSync(appFile, app);
      const recipe = cloneRecipe(fixtureId);
      updateHash(recipe, sandbox, 'src/App.tsx');

      expect(() =>
        validateFixture({fixtureId, fixtureRoot: sandbox, recipe}),
      ).toThrow(new RegExp(`missing nested-overlay probe marker ${marker}`));
    },
  );

  it('rejects missing and oversized gallery assets', () => {
    const parent = fs.mkdtempSync(
      path.join(os.tmpdir(), 'fixture-gallery-test-'),
    );
    temporaryDirectories.push(parent);
    const assetsRoot = path.join(parent, 'assets');
    const readmeFile = path.join(parent, 'README.md');
    fs.mkdirSync(assetsRoot);
    fs.writeFileSync(readmeFile, '![Fixture](assets/fixture.png)\n');

    expect(() => validateFixtureGallery({readmeFile, assetsRoot})).toThrow(
      /image is missing/,
    );

    fs.writeFileSync(
      path.join(assetsRoot, 'fixture.png'),
      Buffer.alloc(FIXTURE_ASSET_MAX_BYTES + 1),
    );
    expect(() => validateFixtureGallery({readmeFile, assetsRoot})).toThrow(
      /image exceeds/,
    );
  });

  it('rejects gallery assets over the aggregate size cap', () => {
    const parent = fs.mkdtempSync(
      path.join(os.tmpdir(), 'fixture-gallery-total-test-'),
    );
    temporaryDirectories.push(parent);
    const assetsRoot = path.join(parent, 'assets');
    const readmeFile = path.join(parent, 'README.md');
    fs.mkdirSync(assetsRoot);
    fs.writeFileSync(
      readmeFile,
      [
        '![Fixture one](assets/fixture-one.png)',
        '![Fixture two](assets/fixture-two.png)',
      ].join('\n'),
    );
    const assetSize = Math.floor(FIXTURE_ASSETS_TOTAL_MAX_BYTES / 2) + 1;
    fs.writeFileSync(
      path.join(assetsRoot, 'fixture-one.png'),
      Buffer.alloc(assetSize),
    );
    fs.writeFileSync(
      path.join(assetsRoot, 'fixture-two.png'),
      Buffer.alloc(assetSize),
    );

    expect(() => validateFixtureGallery({readmeFile, assetsRoot})).toThrow(
      /assets exceed/,
    );
  });

  it('keeps one recipe per fixture', () => {
    const recipeFiles = fs
      .readdirSync(RECIPES_ROOT)
      .filter(file => file.endsWith('.json'))
      .sort();
    expect(recipeFiles).toEqual(FIXTURE_IDS.map(id => `${id}.json`).sort());
  });
});
