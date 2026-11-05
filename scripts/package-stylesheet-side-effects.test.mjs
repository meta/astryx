// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file package-stylesheet-side-effects.test.mjs
 * spec:AST-080 FR4: a product's `import '@astryxdesign/<package>/<name>.css'`
 * survives bundling. Every package that ships a prebuilt stylesheet exports
 * its `.css` subpaths, and its `sideEffects` declaration covers each file, so a
 * bundler that prunes side-effect-free modules (webpack in production) keeps
 * the import.
 *
 * `sideEffects` globs are read the way webpack reads them: matched against the
 * file's path inside the package, and a pattern with no `/` matches the base
 * name at any depth.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = path.join(ROOT, 'packages');

/** Packages whose build writes a prebuilt stylesheet with scripts/build-css.mjs. */
async function stylesheetPackages() {
  const found = [];
  for (const dir of await fs.readdir(PACKAGES)) {
    const file = path.join(PACKAGES, dir, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      continue;
    }
    if (manifest.scripts?.['build:css']?.includes('build-css.mjs')) {
      found.push(manifest);
    }
  }
  return found;
}

/** Every `.css` subpath a manifest exports, with the file it resolves to. */
function cssExports(manifest) {
  return Object.entries(manifest.exports ?? {})
    .filter(([subpath]) => subpath.endsWith('.css'))
    .map(([subpath, target]) => ({
      subpath,
      file: typeof target === 'string' ? target : target.default,
    }));
}

/** Translate one `sideEffects` glob to a RegExp over a package-relative path. */
function globToRegExp(glob) {
  const pattern = glob.replace(/^\.\//, '');
  const source = pattern
    .split(/(\*\*\/|\*\*|\*|\?)/)
    .map(part => {
      if (part === '**/') return '(?:.*/)?';
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      if (part === '?') return '[^/]';
      return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(
    pattern.includes('/') ? `^${source}$` : `(?:^|/)${source}$`,
  );
}

/** Whether a manifest's `sideEffects` keeps the package file `file`. */
function keepsFile(sideEffects, file) {
  if (sideEffects === undefined || sideEffects === true) return true;
  if (!Array.isArray(sideEffects)) return false;
  const relative = file.replace(/^\.\//, '');
  return sideEffects.some(glob => globToRegExp(glob).test(relative));
}

describe('package stylesheets survive bundling (spec:AST-080 FR4)', async () => {
  const manifests = await stylesheetPackages();

  it('finds every package that ships a prebuilt stylesheet', () => {
    const names = manifests.map(manifest => manifest.name);
    expect(names).toEqual(
      expect.arrayContaining([
        '@astryxdesign/core',
        '@astryxdesign/lab',
        '@astryxdesign/richtext',
        '@astryxdesign/charts',
      ]),
    );
  });

  for (const manifest of manifests) {
    for (const {subpath, file} of cssExports(manifest)) {
      it(`${manifest.name}/${subpath.slice(2)} stays in a production bundle`, async () => {
        expect(file).toMatch(/\.css$/);
        expect(keepsFile(manifest.sideEffects, file)).toBe(true);
      });
    }
  }

  it('reads sideEffects the way a bundler does, so the check has teeth', () => {
    expect(keepsFile(false, './dist/lab.css')).toBe(false);
    expect(keepsFile(['**/*.stylex.js'], './dist/lab.css')).toBe(false);
    expect(keepsFile(['*.css'], './dist/lab.css')).toBe(true);
    expect(keepsFile(['**/*.css'], './src/reset.css')).toBe(true);
    expect(keepsFile(['./dist/*.css'], './dist/lab.css')).toBe(true);
    expect(keepsFile(['./src/*.css'], './dist/lab.css')).toBe(false);
  });
});
