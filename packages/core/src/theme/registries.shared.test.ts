// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file registries.shared.test.ts
 * @input Loads of the icon and theme registries on one React (the package and
 *   a swizzled copy) and on a second React in the same page
 * @output Proves copies on one React see each other's registered icons and
 *   themes, and a second React never sees them, so no React renders another
 *   React's elements
 * @position Shared-state tests for Icon/globalIconRegistry.tsx and
 *   theme/themeRegistry.ts (spec:AST-110 FR3)
 */

import {createRequire} from 'node:module';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {DefinedTheme} from './defineTheme';

/** One load of a module on this React, as the package or a copy has. */
async function load<T>(importModule: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return importModule();
}

/**
 * A second instance of React, as a page that loads two React copies has.
 * Node keeps one instance per resolved file, so drop React's files from the
 * require cache, load it again, then put the first instance back.
 */
function secondReact(): typeof import('react') {
  const require = createRequire(import.meta.url);
  const isReactFile = (file: string) =>
    /[\\/]node_modules[\\/]react[\\/]/.test(file);
  const saved = Object.keys(require.cache)
    .filter(isReactFile)
    .map(file => [file, require.cache[file]] as const);
  for (const [file] of saved) {
    Reflect.deleteProperty(require.cache, file);
  }
  try {
    return require('react') as typeof import('react');
  } finally {
    for (const [file, module] of saved) {
      require.cache[file] = module;
    }
  }
}

/** One load of a module on `react`. */
async function loadOn<T>(
  react: typeof import('react'),
  importModule: () => Promise<T>,
): Promise<T> {
  vi.resetModules();
  vi.doMock('react', () => ({...react, default: react}));
  try {
    return await importModule();
  } finally {
    vi.doUnmock('react');
  }
}

const theme = {name: 'registries-shared-probe'} as DefinedTheme;

afterEach(async () => {
  const realm = await import('../utils/sharedRealm');
  realm.resetSharedStateForTest('react/');
  vi.resetModules();
});

describe('icon and theme registries across copies and Reacts', () => {
  it('gives copies on one React one theme registry', async () => {
    const pkg = await load(async () => import('./themeRegistry'));
    const copy = await load(async () => import('./themeRegistry'));
    pkg.registerTheme(theme);
    expect(copy.getRegisteredTheme(theme.name)).toBe(theme);
  });

  it('gives copies on one React one icon registry', async () => {
    const pkg = await load(async () => import('../Icon/globalIconRegistry'));
    const copy = await load(async () => import('../Icon/globalIconRegistry'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    pkg.registerIcons({'probe:mark': 'package mark'});
    expect(copy.getIcon('probe:mark')).toBe('package mark');
  });

  it("keeps one React's themes and icons from another React", async () => {
    const otherReact = secondReact();
    const themesHere = await load(async () => import('./themeRegistry'));
    const iconsHere = await load(
      async () => import('../Icon/globalIconRegistry'),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    themesHere.registerTheme(theme);
    iconsHere.registerIcons({'probe:mark': 'element of this React'});
    const themesThere = await loadOn(
      otherReact,
      async () => import('./themeRegistry'),
    );
    const iconsThere = await loadOn(
      otherReact,
      async () => import('../Icon/globalIconRegistry'),
    );
    expect(themesThere.getRegisteredTheme(theme.name)).toBeNull();
    expect(iconsThere.getIcon('probe:mark')).not.toBe('element of this React');
  });
});
