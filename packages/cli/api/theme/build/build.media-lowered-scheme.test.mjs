// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Media surfaces resolve scheme tokens after a bundler lowers light-dark().
 * @input Real themeBuild calls on each published theme package's source, and
 *   lightningcss with browser targets that lower `light-dark()`.
 * @output Each color-scheme-dependent token inside each `[data-astryx-media]`
 *   surface, in a light and a dark page, resolves under the surface's scheme
 *   in the lowered CSS, as `light-dark()` does in the CSS the build writes.
 * @position Built-theme check for consumers whose bundler lowers
 *   `light-dark()` to `var()` switches. A custom property resolves its `var()`
 *   references on the element that declares it, so a token the surface does
 *   not re-declare keeps the page's scheme. The node project's global setup
 *   supplies the compiled core package.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {themeBuild} from './build.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const THEMES_DIR = path.join(REPO_ROOT, 'packages/themes');
// The repository's lightningcss, the transformer Vite and other bundlers use.
const {transform} = createRequire(
  path.join(REPO_ROOT, 'packages/build/package.json'),
)('lightningcss');

/** Browser targets old enough that lightningcss lowers `light-dark()`. */
const LOWERING_TARGETS = {chrome: 100 << 16, safari: 15 << 16};

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

/** @type {string[]} */
const tmpDirs = [];
/** @type {Map<string, {lowered: string}>} */
const css = new Map();

beforeAll(async () => {
  for (const name of THEMES) {
    const packageDir = path.join(THEMES_DIR, name);
    const entry = fs
      .readdirSync(path.join(packageDir, 'src'))
      .find(file => /^[a-z0-9]+Theme\.ts$/.test(file));
    // The build writes only inside its working directory.
    const tmpDir = fs.mkdtempSync(path.join(packageDir, '.tmp-media-lowered-'));
    tmpDirs.push(tmpDir);
    const out = path.join(tmpDir, 'theme.css');
    await themeBuild(path.join('src', entry), {out}, {cwd: packageDir});
    const built = fs.readFileSync(out, 'utf8');
    const lowered = transform({
      filename: 'theme.css',
      code: Buffer.from(built),
      targets: LOWERING_TARGETS,
    }).code.toString();
    css.set(name, {lowered});
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

/** The theme root's token declarations and each media surface's, in order. */
function blocks(source) {
  const root = source.match(/:scope\s*\{([^}]*--color-text-primary[^}]*)\}/);
  /** @type {Record<string, Record<string, string>>} */
  const surfaces = {dark: {}, light: {}};
  for (const match of source.matchAll(
    /\[data-astryx-media="(dark|light)"\]\s*\{([^}]*)\}/g,
  )) {
    Object.assign(surfaces[match[1]], declarations(match[2]));
  }
  return {root: declarations(root ? root[1] : ''), surfaces};
}

/** lightningcss's scheme switches on an element in each color scheme. */
const SCHEME_SWITCHES = {
  light: {'--lightningcss-light': 'initial', '--lightningcss-dark': ''},
  dark: {'--lightningcss-light': '', '--lightningcss-dark': 'initial'},
};

/**
 * Substitutes `var()` references against one element's computed custom
 * properties. `initial` is the guaranteed-invalid value, so its fallback
 * applies.
 * @param {string} value @param {(name: string) => string | undefined} lookup
 */
function substitute(value, lookup) {
  let result = value;
  for (let depth = 0; depth < 12 && result.includes('var('); depth += 1) {
    result = result.replace(
      /var\((--[\w-]+)(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g,
      (_, name, fallback) => {
        const found = lookup(name);
        return found === undefined || found === 'initial'
          ? (fallback ?? '')
          : found;
      },
    );
  }
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * The value a token computes to inside a media surface: the page element
 * holds the page's scheme switches, the theme root declares the tokens, and
 * the surface declares its own.
 */
function surfaceValue(source, page, surface, token) {
  const {root, surfaces} = blocks(source);
  const own = surfaces[surface];
  const computedRoot = name =>
    root[name] === undefined
      ? SCHEME_SWITCHES[page][name]
      : substitute(root[name], computedRoot);
  const computedSurface = name =>
    own[name] === undefined
      ? computedRoot(name)
      : substitute(own[name], computedSurface);
  return computedSurface(token) ?? '';
}

/**
 * The value a token should compute to inside a media surface: every root
 * value resolved under the surface's own scheme, as `light-dark()` resolves
 * where it is used.
 */
function intendedSurfaceValue(source, surface, token) {
  const {root, surfaces} = blocks(source);
  const own = surfaces[surface];
  const resolve = name => {
    if (own[name] !== undefined) {
      return substitute(own[name], resolve);
    }
    return root[name] === undefined
      ? SCHEME_SWITCHES[surface][name]
      : substitute(root[name], resolve);
  };
  return resolve(token) ?? '';
}

/** Root tokens whose value depends on the color scheme. */
function schemeTokens(source) {
  return Object.keys(blocks(source).root).filter(
    name =>
      intendedSurfaceValue(source, 'dark', name) !==
      intendedSurfaceValue(source, 'light', name),
  );
}

describe('media surfaces after light-dark() lowering', () => {
  it('builds and lowers every published theme', () => {
    expect([...css.keys()]).toEqual(THEMES);
    for (const {lowered} of css.values()) {
      expect(lowered).toContain('--lightningcss-dark');
    }
  });

  for (const name of THEMES) {
    for (const page of /** @type {const} */ (['light', 'dark'])) {
      for (const surface of /** @type {const} */ (['dark', 'light'])) {
        it(`${name}: a ${page} page's ${surface} surface keeps every scheme token`, () => {
          const {lowered} = css.get(name);
          const mismatches = schemeTokens(lowered)
            .map(token => [
              token,
              intendedSurfaceValue(lowered, surface, token),
              surfaceValue(lowered, page, surface, token),
            ])
            .filter(([, expected, actual]) => expected !== actual)
            .map(
              ([token, expected, actual]) =>
                `${token}: ${actual} instead of ${expected}`,
            );
          expect(mismatches).toEqual([]);
        });
      }
    }
  }
});
