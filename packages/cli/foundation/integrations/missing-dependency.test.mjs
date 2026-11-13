// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file missing-dependency.test.mjs
 * @input Load errors as Node words them, beside packages that do or do not
 *   declare the missing package
 * @output Only a missing package its importer declares counts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, describe, expect, it} from 'vitest';
import {missingDeclaredDependency} from './missing-dependency.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-dependency-'));
afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

/** @param {string} name @param {Record<string, unknown>} [fields] */
function pkg(name, fields = {}) {
  const root = path.join(dir, name);
  fs.mkdirSync(path.join(root, 'lib'), {recursive: true});
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({name, ...fields}),
  );
  return path.join(root, 'lib', 'index.mjs');
}

describe('missingDeclaredDependency', () => {
  const declares = pkg('declares', {
    dependencies: {recast: '1.0.0', '@babel/core': '7.0.0'},
  });
  const lacks = pkg('lacks');
  const spaced = pkg('with space', {dependencies: {recast: '1.0.0'}});
  const others = pkg('others', {
    dependencies: {fsevents: '2.0.0'},
    devDependencies: {recast: '1.0.0'},
    optionalDependencies: {postcss: '8.0.0', fsevents: '2.0.0'},
    peerDependencies: {jiti: '2.0.0', zod: '4.0.0'},
    peerDependenciesMeta: {zod: {optional: true}},
  });

  it('names a declared package missing from an ES module import', () => {
    expect(
      missingDeclaredDependency(
        `Cannot find package 'recast' imported from ${declares}`,
      ),
    ).toBe('recast');
    expect(
      missingDeclaredDependency(
        `Cannot find package '@babel/core' imported from ${pathToFileURL(declares).href}`,
      ),
    ).toBe('@babel/core');
  });

  it('names a declared package missing from a CommonJS require', () => {
    expect(
      missingDeclaredDependency(
        `Cannot find module 'recast/parsers/babel'\nRequire stack:\n- ${declares}`,
      ),
    ).toBe('recast');
  });

  it('reads an importer whose path has a space', () => {
    expect(
      missingDeclaredDependency(
        `Cannot find package 'recast' imported from ${spaced}`,
      ),
    ).toBe('recast');
  });

  it('counts a peer not marked optional, and no dev, optional (even if also a dependency) or optional-peer package', () => {
    /** @param {string} name */
    const missing = name =>
      missingDeclaredDependency(
        `Cannot find package '${name}' imported from ${others}`,
      );
    expect(missing('jiti')).toBe('jiti');
    expect(missing('recast')).toBeNull();
    expect(missing('postcss')).toBeNull();
    expect(missing('zod')).toBeNull();
    // Listed as both a dependency and an optional one: optional, as npm reads it.
    expect(missing('fsevents')).toBeNull();
  });

  it('is null for an undeclared package, a relative path, or another error', () => {
    expect(
      missingDeclaredDependency(
        `Cannot find package 'recast' imported from ${lacks}`,
      ),
    ).toBeNull();
    expect(
      missingDeclaredDependency(
        `Cannot find module './x.mjs' imported from ${declares}`,
      ),
    ).toBeNull();
    expect(missingDeclaredDependency('boom')).toBeNull();
  });
});
