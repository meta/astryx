#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Ship each built-in theme's open-licensed fonts in its package. A
 * theme's `fonts.google.css` names its families and weights (the Google
 * Fonts stylesheet, kept as the remote path); this script takes those
 * faces from the Fontsource packages, copies their woff2 files and licenses
 * into the theme's `fonts/` folder, and writes `fonts.css`: local
 * `@font-face` rules with `font-display: swap`, so a page draws at once and
 * never waits on a network. Run it after changing a theme's fonts.
 * @input packages/themes/<theme>/fonts.google.css; the Fontsource packages,
 *   fetched with `npm pack`
 * @output packages/themes/<theme>/fonts.css and fonts/
 * @position scripts/ — a maintainer's tool, run by hand
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** The Fontsource release the shipped files come from. */
const FONTSOURCE_VERSION = '5.3.0';

const root = path.resolve(import.meta.dirname, '..');
const themesDir = path.join(root, 'packages/themes');

/**
 * The families and weights a Google Fonts stylesheet asks for.
 * @param {string} css
 * @returns {Array<{family: string, weights: number[]}>}
 */
export function googleFamilies(css) {
  const url = /@import\s+url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(css)?.[1];
  if (!url) return [];
  return [...new URL(url).searchParams.getAll('family')].map(spec => {
    const [name, axes = ''] = spec.split(':');
    const values = axes.split('@')[1] ?? '';
    const weights = values
      ? values.split(';').map(v => Number(v.split(',').at(-1)))
      : [400];
    return {family: name.replace(/\+/g, ' '), weights};
  });
}

/** @param {string} family */
const slugOf = family => family.toLowerCase().replace(/\s+/g, '-');

/**
 * A Fontsource package's files, fetched once into a temp folder.
 * @param {string} slug
 * @param {string} tmp
 */
function fontsource(slug, tmp) {
  const dir = path.join(tmp, slug);
  if (!fs.existsSync(dir)) {
    const tgz = execFileSync(
      'npm',
      ['pack', `@fontsource/${slug}@${FONTSOURCE_VERSION}`, '--silent'],
      {cwd: tmp, encoding: 'utf8'},
    ).trim();
    fs.mkdirSync(dir);
    execFileSync('tar', ['-xzf', path.join(tmp, tgz), '-C', dir]);
  }
  return path.join(dir, 'package');
}

/**
 * The `@font-face` rules of a Fontsource weight's stylesheet, each with its
 * woff2 file only.
 * @param {string} css
 */
function faces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => {
    const body = m[1];
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(body)?.[1];
    if (!file) throw new Error(`no woff2 in ${body}`);
    return {file, body};
  });
}

/**
 * Ship one theme's fonts.
 * @param {string} theme
 * @param {string} tmp
 */
function vendorTheme(theme, tmp) {
  const dir = path.join(themesDir, theme);
  const google = path.join(dir, 'fonts.google.css');
  if (!fs.existsSync(google)) return;
  const out = path.join(dir, 'fonts');
  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(out);
  const rules = [];
  for (const {family, weights} of googleFamilies(
    fs.readFileSync(google, 'utf8'),
  )) {
    const slug = slugOf(family);
    const pkg = fontsource(slug, tmp);
    fs.copyFileSync(
      path.join(pkg, 'LICENSE'),
      path.join(out, `${slug}.LICENSE.txt`),
    );
    for (const weight of weights) {
      for (const {file, body} of faces(
        fs.readFileSync(path.join(pkg, `${weight}.css`), 'utf8'),
      )) {
        fs.copyFileSync(path.join(pkg, 'files', file), path.join(out, file));
        const local = body
          .replace(/src:[^;]*;/, `src: url('./fonts/${file}') format('woff2');`)
          .trim()
          .split('\n')
          .map(line => `  ${line.trim()}`)
          .join('\n');
        rules.push(`@font-face {\n${local}\n}`);
      }
    }
  }
  fs.writeFileSync(
    path.join(dir, 'fonts.css'),
    [
      '/* Copyright (c) Meta Platforms, Inc. and affiliates. */',
      '',
      '/*',
      " * The theme's fonts, shipped in this package (their licenses are in",
      ' * fonts/): each face is a local woff2 file with font-display: swap, so a',
      ' * page draws at once in its fallback font and never waits on a network.',
      ' * fonts.google.css loads the same faces from Google Fonts instead.',
      ' * Written by scripts/vendor-theme-fonts.mjs: do not edit by hand.',
      ' */',
      '',
      rules.join('\n\n'),
      '',
    ].join('\n'),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-fonts-'));
  try {
    for (const theme of fs.readdirSync(themesDir)) vendorTheme(theme, tmp);
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}
