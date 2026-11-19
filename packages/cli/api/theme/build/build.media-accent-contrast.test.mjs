// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Accent text stays readable on media surfaces in every shipped theme.
 * @input Real themeBuild calls on each published theme package's source, the
 *   same command its package build runs.
 * @output The color accent text and accent icons resolve to inside each
 *   `[data-astryx-media]` surface of the built CSS, and its contrast against
 *   the surface (WCAG 2.2 SC 1.4.3, 4.5:1).
 * @position Built-theme accessibility check for media surfaces. A media
 *   surface sets `color-scheme` and re-declares its surface tokens; a token it
 *   does not re-declare keeps the value the theme root computed. The node
 *   project's global setup supplies the compiled core package.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeBuild} from './build.mjs';

const THEMES_DIR = path.resolve(import.meta.dirname, '../../../../themes');

/** Published theme packages and their source entry. */
const THEMES = fs
  .readdirSync(THEMES_DIR)
  .filter(name => {
    const manifest = path.join(THEMES_DIR, name, 'package.json');
    return (
      fs.existsSync(manifest) &&
      JSON.parse(fs.readFileSync(manifest, 'utf8')).private !== true
    );
  })
  .sort();

const ACCENT_TOKENS = ['--color-text-accent', '--color-icon-accent'];

/**
 * The reference background of each surface: the on-color for the opposite
 * surface, which the theme designs to read as that surface's backdrop.
 */
const SURFACE_BACKDROP = {
  dark: '--color-on-light',
  light: '--color-on-dark',
};

/** @type {string[]} */
const tmpDirs = [];
/** @type {Map<string, string>} */
const builtCss = new Map();

beforeAll(async () => {
  for (const name of THEMES) {
    const packageDir = path.join(THEMES_DIR, name);
    const entry = fs
      .readdirSync(path.join(packageDir, 'src'))
      .find(file => /^[a-z0-9]+Theme\.ts$/.test(file));
    // The build writes only inside its working directory.
    const tmpDir = fs.mkdtempSync(path.join(packageDir, '.tmp-media-accent-'));
    tmpDirs.push(tmpDir);
    const out = path.join(tmpDir, 'theme.css');
    await themeBuild(path.join('src', entry), {out}, {cwd: packageDir});
    builtCss.set(name, fs.readFileSync(out, 'utf8'));
  }
}, 240_000);

afterAll(() => {
  for (const tmpDir of tmpDirs) {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
});

/** @param {string} body */
function declarations(body) {
  /** @type {Record<string, string>} */
  const map = {};
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon > 0) {
      map[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
    }
  }
  return map;
}

/** The theme root's token declarations and each media surface's. */
function blocks(css) {
  const root = css.match(/:scope\s*\{([^}]*--color-text-primary[^}]*)\}/);
  /** @type {Record<string, Record<string, string>>} */
  const surfaces = {};
  for (const match of css.matchAll(
    /\[data-astryx-media="(dark|light)"\]\s*\{([^}]*)\}/g,
  )) {
    surfaces[match[1]] = declarations(match[2]);
  }
  return {root: declarations(root ? root[1] : ''), surfaces};
}

/**
 * Substitutes `var()` references the way the browser does for a custom
 * property: against the declarations of the element that declares it.
 * @param {string} value @param {(name: string) => string | undefined} lookup
 */
function substitute(value, lookup) {
  let result = value;
  for (let depth = 0; depth < 10 && result.includes('var('); depth += 1) {
    result = result.replace(
      /var\((--[\w-]+)(?:,\s*([^()]*))?\)/g,
      (_, name, fallback) => lookup(name) ?? fallback ?? '',
    );
  }
  return result;
}

/** Resolves `light-dark()` for the surface's color scheme. */
function pickScheme(value, surface) {
  const match = value.match(/^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/);
  if (!match) {
    return value;
  }
  return surface === 'dark' ? match[2] : match[1];
}

/**
 * The color a token takes on the innermost of nested media surfaces, given
 * outermost first. Each surface resolves what it declares and inherits the
 * rest from the surface around it.
 */
function surfaceColor(css, surfaceChain, token) {
  const chain = [].concat(surfaceChain);
  const {root, surfaces} = blocks(css);
  let inherited = name =>
    root[name] === undefined ? undefined : substitute(root[name], inherited);
  for (const surface of chain) {
    const own = surfaces[surface] ?? {};
    const outer = inherited;
    const resolve = name =>
      own[name] === undefined ? outer(name) : substitute(own[name], resolve);
    inherited = resolve;
  }
  return pickScheme(inherited(token) ?? '', chain.at(-1));
}

/** @param {string} color A `#rgb`, `#rrggbb` or `rgb()` color. */
function channels(color) {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? [...hex[1]].map(digit => digit + digit).join('')
        : hex[1];
    return [0, 2, 4].map(i => Number.parseInt(digits.slice(i, i + 2), 16));
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) {
    return rgb.slice(1, 4).map(Number);
  }
  throw new Error(`Unsupported color: ${color}`);
}

function luminance(color) {
  const [r, g, b] = channels(color).map(value => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('accent on media surfaces in built themes', () => {
  it('builds every published theme', () => {
    expect(THEMES.length).toBeGreaterThan(0);
    expect([...builtCss.keys()]).toEqual(THEMES);
  });

  for (const name of THEMES) {
    for (const surface of /** @type {const} */ ([
      'dark',
      'light',
      ['light', 'dark'],
      ['dark', 'light'],
    ])) {
      for (const token of ACCENT_TOKENS) {
        const where = [].concat(surface).reverse().join(' surface inside a ');
        it(`${name}: ${token} reads on a ${where} media surface`, () => {
          const css = builtCss.get(name);
          const foreground = surfaceColor(css, surface, token);
          const backdrop = surfaceColor(
            css,
            surface,
            SURFACE_BACKDROP[[].concat(surface).at(-1)],
          );
          expect(
            contrast(foreground, backdrop),
            `${foreground} on ${backdrop}`,
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});
