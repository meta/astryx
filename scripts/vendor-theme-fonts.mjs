#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Ship each built-in theme's open-licensed fonts in its package.
 * THEME_FONTS names each theme's families and weights, as a Google Fonts
 * request names them; this script takes those faces from the Fontsource
 * packages, copies their woff2 files and licenses
 * into the theme's `fonts/` folder, and writes `fonts.css`: local
 * `@font-face` rules with `font-display: fallback`, so a page never waits
 * on a network; served from the same machine or a fast connection, a face
 * arrives within the brief block period and text first draws in it. Run it after changing a theme's fonts, then
 * format the stylesheets it writes with prettier (each
 * `packages/themes/<theme>/fonts.css`).
 * @input THEME_FONTS; the Fontsource packages, fetched with `npm pack`
 * @output packages/themes/<theme>/fonts.css and fonts/
 * @position scripts/ — a maintainer's tool, run by hand
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

/** The Fontsource release the shipped files come from. */
const FONTSOURCE_VERSION = '5.3.0';

const root = path.resolve(import.meta.dirname, '..');
const themesDir = path.join(root, 'packages/themes');

/**
 * Each built-in theme's fonts, as the Google Fonts request for them names
 * their families, axes and weights (`Figtree:wght@400;700`).
 * @type {Record<string, string[]>}
 */
export const THEME_FONTS = {
  butter: [
    'JetBrains Mono:wght@400;500;600;700',
    'Outfit:wght@400;500;600;700',
    'Sarina',
  ],
  chocolate: [
    'Albert Sans:wght@400;500;600;700',
    'Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700',
    'JetBrains Mono:wght@400;500;600;700',
  ],
  gothic: [
    'Fustat:wght@400;500;600;700',
    'JetBrains Mono:wght@400;500;600;700',
    'Manufacturing Consent',
    'UnifrakturMaguntia',
  ],
  matcha: [
    'DM Sans:wght@400;500;600;700',
    'JetBrains Mono:wght@400;500;600;700',
    'Playwrite US Trad',
  ],
  neutral: ['Figtree:wght@400;500;600;700'],
  stone: [
    'Figtree:wght@400;500;600;700',
    'JetBrains Mono:wght@400;500;600;700',
    'Montserrat:wght@400;500;600;700',
  ],
  y2k: [
    'Crimson Text:wght@400;600;700',
    'JetBrains Mono:wght@400;500;600;700',
    'Poppins:wght@400;500;600;700',
  ],
};

/**
 * The families a Google Fonts request asks for: each with its weights,
 * and the axes it asks for beyond weight (`opsz`, an optical size), which
 * only a variable face carries.
 * @param {string[]} specs one per family (`Figtree:wght@400;700`)
 * @returns {Array<{family: string, weights: number[], axes: string[]}>}
 */
export function googleFamilies(specs) {
  return specs.map(spec => {
    const [name, request = ''] = spec.split(':');
    const [axisList = '', values = ''] = request.split('@');
    const names = axisList ? axisList.split(',') : ['wght'];
    const at = names.indexOf('wght');
    const weights = values
      ? values.split(';').map(v => Number(v.split(',')[at]))
      : [400];
    return {
      family: name.replace(/\+/g, ' '),
      weights,
      axes: names.filter(a => a !== 'wght' && a !== 'ital'),
    };
  });
}

/** @param {string} family */
const slugOf = family => family.toLowerCase().replace(/\s+/g, '-');

/**
 * A Fontsource package's files, fetched once into a temp folder: the static
 * faces, or with `variable` the variable ones.
 * @param {string} slug
 * @param {string} tmp
 * @param {boolean} [variable]
 */
function fontsource(slug, tmp, variable = false) {
  const scope = variable ? 'fontsource-variable' : 'fontsource';
  const dir = path.join(tmp, `${scope}-${slug}`);
  if (!fs.existsSync(dir)) {
    const tgz = execFileSync(
      'npm',
      ['pack', `@${scope}/${slug}@${FONTSOURCE_VERSION}`, '--silent'],
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
  const specs = THEME_FONTS[theme];
  if (!specs) return;
  const out = path.join(dir, 'fonts');
  fs.rmSync(out, {recursive: true, force: true});
  fs.mkdirSync(out);
  const rules = [];
  for (const {family, weights, axes} of googleFamilies(specs)) {
    const slug = slugOf(family);
    // An axis beyond weight (an optical size) lives in the variable face
    // only: that face is shipped, under the family's own name, so the theme
    // keeps the axis it asked for.
    const variable = axes.length > 0;
    const pkg = fontsource(slug, tmp, variable);
    fs.copyFileSync(
      path.join(pkg, 'LICENSE'),
      path.join(out, `${slug}.LICENSE.txt`),
    );
    const sheets = variable
      ? [`${axes[0]}.css`]
      : weights.map(weight => `${weight}.css`);
    for (const sheet of sheets) {
      for (const {file, body} of faces(
        fs.readFileSync(path.join(pkg, sheet), 'utf8'),
      )) {
        fs.copyFileSync(path.join(pkg, 'files', file), path.join(out, file));
        const local = body
          .replace(/font-family:[^;]*;/, `font-family: '${family}';`)
          // The face loads from the package within the block period, so the
          // text never paints in its fallback first.
          .replace(/font-display:[^;]*;/, 'font-display: fallback;')
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
      ' * fonts/): each face is a local woff2 file with font-display: fallback.',
      ' * Text waits about 100 ms for its face; served from the same machine or a',
      ' * fast connection, the face arrives in that time and the text first draws',
      " * in the theme's font. A slower face shows the fallback font, and one that",
      ' * takes more than about 3 s stays in it on that page. A page never waits',
      ' * on a network.',
      ' * Written by scripts/vendor-theme-fonts.mjs: do not edit by hand.',
      ' */',
      '',
      rules.join('\n\n'),
      '',
    ].join('\n'),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-fonts-'));
  try {
    for (const theme of fs.readdirSync(themesDir)) vendorTheme(theme, tmp);
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}
