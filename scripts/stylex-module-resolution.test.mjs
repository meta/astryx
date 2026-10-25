// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylex-module-resolution.test.mjs
 *
 * A compile-time `stylex.when.ancestor()` on another workspace package's
 * marker matches only if the importing compile names the marker exactly as
 * the defining package's own build does. StyleX's built-in `commonJS`
 * resolution resolves a built package's specifier to its `dist` file, whose
 * canonical name differs from the `src` file the package compiled; the shared
 * resolution resolves it to the `source` export.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

import yaml from 'yaml';

import {transformSync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {afterAll, describe, expect, it} from 'vitest';

const require = createRequire(import.meta.url);
const {
  createStylexModuleResolution,
} = require('./stylex-module-resolution.cjs');

const ROOT = path.resolve(import.meta.dirname, '..');

const PROBE = `
import * as stylex from '@stylexjs/stylex';
import {scope} from '@probe/core/marker.stylex';
export const styles = stylex.create({
  child: {color: {default: 'red', [stylex.when.ancestor(':hover', scope)]: 'blue'}},
});
`;

/** The marker class a compile gives `defineMarker`, from its emitted object. */
const markerClass = code => /\{\s*(\w+):\s*"\1"/.exec(code)?.[1];
/** The marker class in a compile's `:where(.<marker>:hover *)` rule. */
const ancestorClass = rules =>
  rules
    .map(([, css]) => /:where\(\.(\w+):hover \*\)/.exec(css.ltr)?.[1])
    .find(Boolean);

function compile(code, filename, unstable_moduleResolution) {
  return transformSync(code, {
    babelrc: false,
    configFile: false,
    filename,
    presets: [['@babel/preset-typescript', {isTSX: true, allExtensions: true}]],
    plugins: [
      [
        stylexBabelPlugin,
        {dev: false, runtimeInjection: false, unstable_moduleResolution},
      ],
    ],
  });
}

describe('a marker from another workspace package', () => {
  // Two packages, the way core and lab sit: `@probe/core` exports its marker
  // with a `source` condition and a built `dist` file, and `@probe/lab`
  // reaches it through node_modules.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stylex-resolution-'));
  afterAll(() => fs.rmSync(root, {recursive: true, force: true}));
  const core = path.join(root, 'packages/core');
  const lab = path.join(root, 'packages/lab');
  const marker =
    "import * as stylex from '@stylexjs/stylex';\nexport const scope = stylex.defineMarker();\n";
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  };
  write(
    path.join(core, 'package.json'),
    JSON.stringify({
      name: '@probe/core',
      exports: {
        './marker.stylex': {
          source: './src/marker.stylex.ts',
          default: './dist/marker.stylex.js',
        },
      },
    }),
  );
  write(path.join(core, 'src/marker.stylex.ts'), marker);
  write(path.join(core, 'dist/marker.stylex.js'), marker);
  write(path.join(lab, 'package.json'), JSON.stringify({name: '@probe/lab'}));
  fs.mkdirSync(path.join(lab, 'node_modules/@probe'), {recursive: true});
  fs.symlinkSync(core, path.join(lab, 'node_modules/@probe/core'), 'dir');
  const probe = path.join(lab, 'src/Probe.tsx');
  write(probe, PROBE);

  // The defining package's own build: StyleX's resolution, its own root.
  const coreClass = markerClass(
    compile(marker, path.join(core, 'src/marker.stylex.ts'), {
      type: 'commonJS',
      rootDir: core,
    }).code,
  );

  it('is named after its dist file by the built-in resolution', () => {
    const rules = compile(PROBE, probe, {type: 'commonJS', rootDir: root})
      .metadata.stylex;
    expect(coreClass).toMatch(/^x\w+$/);
    expect(ancestorClass(rules)).not.toBe(coreClass);
  });

  it('is named after its source file, as its package names it, by the shared resolution', () => {
    const resolution = createStylexModuleResolution({
      root,
      workspaceRoots: ['packages'],
    });
    const rules = compile(PROBE, probe, resolution).metadata.stylex;
    expect(ancestorClass(rules)).toBe(coreClass);
  });
});

describe("lab's build and core's build", () => {
  it("name core's indicatorScope alike", () => {
    const corePackage = path.join(ROOT, 'packages/core');
    const markerFile = path.join(
      corePackage,
      'src/Indicator/indicator.markers.stylex.ts',
    );
    const coreClass = markerClass(
      transformSync(fs.readFileSync(markerFile, 'utf8'), {
        filename: markerFile,
        configFile: path.join(corePackage, 'babel.config.json'),
        cwd: corePackage,
      }).code,
    );
    const labPackage = path.join(ROOT, 'packages/lab');
    const source = `
import * as stylex from '@stylexjs/stylex';
import {indicatorScope} from '@astryxdesign/core/Indicator/indicator.markers.stylex';
export const styles = stylex.create({
  tint: {color: {default: 'red', [stylex.when.ancestor(':hover', indicatorScope)]: 'blue'}},
});
`;
    const rules = transformSync(source, {
      filename: path.join(labPackage, 'src/MarkerProbe.tsx'),
      configFile: path.join(labPackage, 'babel.config.cjs'),
      cwd: labPackage,
    }).metadata.stylex;
    expect(coreClass).toMatch(/^x\w+$/);
    expect(ancestorClass(rules)).toBe(coreClass);
  });
});

describe('StyleX configs', () => {
  // Every config that compiles workspace source against another package's
  // `.stylex` files uses the shared resolution, not StyleX's built-in one.
  it.each([
    'packages/lab/babel.config.cjs',
    'packages/charts/babel.config.cjs',
    'packages/richtext/babel.config.cjs',
    'scripts/build-css.mjs',
    'vitest.config.ts',
    'apps/storybook/.storybook/main.ts',
    'apps/storybook/vite.config.ts',
    'apps/sandbox/vite.config.mts',
    'apps/docsite/babel.config.js',
    'internal/vibe-tests/app/vite.config.ts',
    'internal/vibe-tests/app/vite.config.preview.ts',
  ])('%s uses the shared resolution', file => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(text).toContain('stylex-module-resolution.cjs');
    expect(text).not.toMatch(/type: ['"]commonJS['"]/);
  });
});

describe('the browser check', () => {
  it('runs in test-build after Chromium is installed', () => {
    const ci = yaml.parse(
      fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'),
    );
    const steps = ci.jobs['test-build'].steps;
    const install = steps.findIndex(
      step => step.run === 'npx playwright install chromium',
    );
    const check = steps.findIndex(
      step => step.name === 'Run cross-package StyleX marker browser check',
    );
    expect(install).toBeGreaterThanOrEqual(0);
    expect(check).toBeGreaterThan(install);
    expect(steps[check].env).toEqual({ASTRYX_STYLEX_BROWSER: '1'});
    expect(steps[check].run).toContain(
      'scripts/stylex-module-resolution.browser.test.mjs',
    );
    expect(steps[check]['continue-on-error']).toBeUndefined();
  });
});
