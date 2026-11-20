// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {ownModuleUrl} from './own-modules.mjs';

const ROOT = 'file:///work/app/node_modules/@astryxdesign/cli/';
const PARENT = `${ROOT}foundation/fs/gather-cache.mjs`;

describe('ownModuleUrl', () => {
  it("resolves an import between two of the CLI's own modules by path", () => {
    expect(ownModuleUrl('./paths.mjs', PARENT, ROOT)).toBe(
      `${ROOT}foundation/fs/paths.mjs`,
    );
    expect(ownModuleUrl('../../api/index.mjs', PARENT, ROOT)).toBe(
      `${ROOT}api/index.mjs`,
    );
  });

  it.each([
    ['a package import', 'zod', PARENT],
    ['a built-in import', 'node:fs', PARENT],
    ['an absolute URL', `${ROOT}foundation/fs/paths.mjs`, PARENT],
    ['a file that is not a module', './data.json', PARENT],
    ['a query', './paths.mjs?fresh=1', PARENT],
    ['a hash', './paths.mjs#top', PARENT],
    ['an escaped separator', './a%2Fb.mjs', PARENT],
    [
      "an import from the CLI's own node_modules",
      './x.mjs',
      `${ROOT}node_modules/dep/index.mjs`,
    ],
    [
      'an import from another package',
      './x.mjs',
      'file:///work/app/node_modules/other/index.mjs',
    ],
    ['an import from no module', './x.mjs', undefined],
    [
      "an import that leaves the CLI's folder",
      '../../../../other/x.mjs',
      PARENT,
    ],
    [
      "an import into the CLI's own node_modules",
      '../../node_modules/dep/x.mjs',
      PARENT,
    ],
  ])('leaves %s to Node', (_case, specifier, parent) => {
    expect(ownModuleUrl(specifier, parent, ROOT)).toBeNull();
  });
});
