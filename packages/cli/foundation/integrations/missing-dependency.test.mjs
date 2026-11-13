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

/** @param {string} name @param {Record<string, string>} [deps] */
function pkg(name, deps = {}) {
  const root = path.join(dir, name);
  fs.mkdirSync(path.join(root, 'lib'), {recursive: true});
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({name, dependencies: deps, peerDependencies: {}}),
  );
  return path.join(root, 'lib', 'index.mjs');
}

describe('missingDeclaredDependency', () => {
  const declares = pkg('declares', {recast: '1.0.0', '@babel/core': '7.0.0'});
  const lacks = pkg('lacks');

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
