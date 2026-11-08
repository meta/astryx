// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {loadThemeOverrides} from './sources.mjs';

/** @type {string[]} */
const made = [];

/**
 * A repo root with `packages/core/dist` present and one theme package, whose
 * built source is written only when `built` is true.
 *
 * @param {{built: boolean}} options
 */
function fixture({built}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-gate-sources-'));
  made.push(root);
  fs.mkdirSync(path.join(root, 'packages/core/dist/theme'), {recursive: true});
  fs.writeFileSync(path.join(root, 'packages/core/dist/theme/index.js'), '');
  const dir = path.join(root, 'packages/themes/butter');
  fs.mkdirSync(path.join(dir, 'dist'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: '@astryxdesign/theme-butter'}),
  );
  if (built) writeBuilt(dir);
  return {root, dir};
}

/** @param {string} dir */
function writeBuilt(dir) {
  fs.writeFileSync(
    path.join(dir, 'dist/source.mjs'),
    "export const theme = {name: 'butter', components: {badge: {base: {}, 'variant:info': {}}}};\n",
  );
}

afterEach(() => {
  for (const root of made.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});

describe('loadThemeOverrides', () => {
  it('reads a built theme without building anything', async () => {
    const {root} = fixture({built: true});
    /** @type {string[]} */
    const builds = [];

    const overrides = await loadThemeOverrides(root, 'probe', (_root, pkg) => builds.push(pkg));

    expect(overrides).toEqual({butter: {badge: ['base', 'variant:info']}});
    expect(builds).toEqual([]);
  });

  it('builds the theme it cannot read, so a missing CI artifact is not a failure', async () => {
    const {root, dir} = fixture({built: false});
    /** @type {string[]} */
    const builds = [];

    const overrides = await loadThemeOverrides(root, 'probe', (_root, pkg) => {
      builds.push(pkg);
      writeBuilt(dir);
    });

    expect(builds).toEqual(['@astryxdesign/theme-butter']);
    expect(overrides).toEqual({butter: {badge: ['base', 'variant:info']}});
  });

  it('builds core first when its dist is the thing missing', async () => {
    const {root, dir} = fixture({built: false});
    fs.rmSync(path.join(root, 'packages/core/dist'), {recursive: true});
    /** @type {string[]} */
    const builds = [];

    await loadThemeOverrides(root, 'probe', (_root, pkg) => {
      builds.push(pkg);
      if (pkg === '@astryxdesign/theme-butter') writeBuilt(dir);
    });

    expect(builds).toEqual(['@astryxdesign/core', '@astryxdesign/theme-butter']);
  });

  it('says it tried when the rebuild does not produce a loadable theme', async () => {
    const {root} = fixture({built: false});

    await expect(loadThemeOverrides(root, 'probe', () => {})).rejects.toThrow(
      /could not load theme butter[\s\S]*rebuilt @astryxdesign\/theme-butter here and the import still fails/,
    );
  });
});
