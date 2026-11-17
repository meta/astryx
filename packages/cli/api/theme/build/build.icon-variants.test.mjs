// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A built theme keeps its `iconVariants` list.
 *
 * `architecture:theme-compilation` (System model item 7): a built theme carries
 * its `iconVariants` list in its JavaScript, so the built theme, and a theme
 * that `extends` it, read the same list as the runtime theme
 * (`spec:AST-087` FR2, FR18).
 *
 * `themeBuild` compiles via @astryxdesign/core, so it needs a built core — the
 * `node` project's globalSetup builds it once before workers fork.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {defineTheme} from '@astryxdesign/core/theme';
import {themeBuild} from './build.mjs';

vi.setConfig({testTimeout: 30000});

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-variants-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Build a raw theme source and import the generated module's theme.
 * @param {Record<string, unknown>} source
 */
async function buildAndImport(source) {
  const name = String(source.name);
  fs.writeFileSync(
    path.join(tmpDir, `${name}.mjs`),
    `export default ${JSON.stringify({tokens: {}, ...source})};\n`,
  );
  await themeBuild(`${name}.mjs`, {}, {cwd: tmpDir});
  const mod = await import(pathToFileURL(path.join(tmpDir, `${name}.js`)).href);
  const [theme] = Object.values(mod);
  return /** @type {any} */ (theme);
}

describe('theme build keeps the iconVariants list', () => {
  it('writes the list a theme sets, as the runtime theme reads it', async () => {
    const source = {name: 'listed-icons', iconVariants: ['outline', 'filled']};
    const built = await buildAndImport(source);

    expect(built.__built).toBe(true);
    expect(built.iconVariants).toEqual(['outline', 'filled']);
    expect(built.iconVariants).toEqual(defineTheme(source).iconVariants);
  });

  it('lets a child of the built theme inherit or replace the list, as at runtime', async () => {
    const source = {name: 'base-icons', iconVariants: ['outline', 'filled']};
    const built = await buildAndImport(source);
    const runtime = defineTheme(source);

    const inherits = defineTheme({name: 'inherits', extends: built});
    const replaces = defineTheme({
      name: 'replaces',
      extends: built,
      iconVariants: ['bold'],
    });

    expect(inherits.iconVariants).toEqual(['outline', 'filled']);
    expect(replaces.iconVariants).toEqual(['bold']);
    expect(inherits.iconVariants).toEqual(
      defineTheme({name: 'inherits-runtime', extends: runtime}).iconVariants,
    );
    expect(replaces.iconVariants).toEqual(
      defineTheme({
        name: 'replaces-runtime',
        extends: runtime,
        iconVariants: ['bold'],
      }).iconVariants,
    );
  });

  it('keeps an explicit empty list, which replaces an inherited one', async () => {
    const built = await buildAndImport({
      name: 'emptied-icons',
      iconVariants: [],
    });

    expect(built.iconVariants).toEqual([]);
    expect(
      defineTheme({name: 'emptied-child', extends: built}).iconVariants,
    ).toEqual([]);
  });

  it('writes no list for a theme without one', async () => {
    const built = await buildAndImport({name: 'unlisted-icons'});

    expect('iconVariants' in built).toBe(false);
    expect(
      defineTheme({name: 'unlisted-child', extends: built}).iconVariants,
    ).toBeUndefined();
  });
});
