// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A small built base theme for a linked fixture, so tests that build
 *   on a base theme do not need a built theme package.
 * @input A fixture directory from makeLinkedFixture and a base theme name.
 * @output The base theme package beside the fixture, with a `built` entry.
 * @position Test support. The package exports what a built theme package
 *   exports under `built`: `<name>Theme`, with two-mode colors and the
 *   heading level styles that the lift pass must repeat a setting on.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The Astryx packages a theme-edit fixture resolves, without the themes. */
export const FIXTURE_PACKAGES = [
  '@astryxdesign/core',
  '@astryxdesign/lab',
  '@astryxdesign/charts',
  'react',
  'react-dom',
];

/**
 * Writes `@astryxdesign/theme-<like>` beside the fixture `dir`.
 * @param {string} dir
 * @param {string} [like]
 */
export function writeFixtureBaseTheme(dir, like = 'neutral') {
  const pkgDir = path.join(
    path.dirname(dir),
    'node_modules',
    '@astryxdesign',
    `theme-${like}`,
  );
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    `${JSON.stringify(
      {
        name: `@astryxdesign/theme-${like}`,
        version: '0.0.0',
        type: 'module',
        exports: {'./built': './built.js'},
      },
      null,
      2,
    )}\n`,
  );
  const level = (/** @type {number} */ n) => ({
    fontFamily: 'var(--font-family-heading)',
    fontSize: `var(--text-heading-${n}-size)`,
    fontWeight: `var(--text-heading-${n}-weight)`,
    lineHeight: `var(--text-heading-${n}-leading)`,
  });
  const theme = {
    name: like,
    tokens: {
      '--color-background-body': ['#f1f1f1', '#1b1b1b'],
      '--color-background-card': ['#ffffff', '#1b1b1b'],
      '--color-accent': ['#1b1b1b', '#f1f1f1'],
      '--color-text-primary': ['#000000', '#ffffff'],
      '--color-text-secondary': ['#474747', '#9e9e9e'],
      '--color-border': ['#d4d4d4', '#474747'],
      '--text-heading-1-weight': 'var(--font-weight-semibold)',
      '--text-heading-6-weight': 'var(--font-weight-semibold)',
    },
    components: {
      heading: Object.fromEntries(
        [1, 2, 3, 4, 5, 6].map(n => [`level:${n}`, level(n)]),
      ),
    },
  };
  fs.writeFileSync(
    path.join(pkgDir, 'built.js'),
    `export const ${like}Theme = ${JSON.stringify(theme, null, 2)};\n`,
  );
}
