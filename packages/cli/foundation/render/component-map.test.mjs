// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The component map tolerates Astryx packages the project does not
 * install, so the CLI needs no peer on Lab or Charts.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

import {componentMap} from './component-map.mjs';
import {rebuildPage} from './rebuild.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

/** A project with a package.json and no Astryx packages installed. */
function emptyProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-component-map-'));
  roots.push(root);
  fs.writeFileSync(
    path.join(root, 'package.json'),
    '{"name":"app","private":true}',
  );
  fs.mkdirSync(path.join(root, 'node_modules'));
  return root;
}

describe('componentMap without the package installed', () => {
  it('returns an empty map for Lab and Charts, without an error', () => {
    const root = emptyProject();
    for (const pkg of ['@astryxdesign/lab', '@astryxdesign/charts']) {
      const map = componentMap(pkg, root);
      expect(map).toBeInstanceOf(Map);
      expect(map.size).toBe(0);
    }
  });

  it('lets a page rebuild in a project with neither installed', () => {
    const root = emptyProject();
    expect(() =>
      rebuildPage('<html><body><p>Hello</p></body></html>', root),
    ).not.toThrow();
  });
});
