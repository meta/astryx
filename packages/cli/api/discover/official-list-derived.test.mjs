// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A checkout's CLI lists a new official package with no edit outside the
 * package (spec:AST-051 FR11): the list is derived from the repository, not
 * read from a committed copy.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {officialList} from './_adapter.mjs';

describe('the official list in a checkout', () => {
  /** @type {string} */
  let root;

  /** @param {string} file @param {string} text */
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), text);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-official-derived-'));
    // A canary-only package with one component, as a new Lab-style package
    // is, and nothing written anywhere else.
    write(
      'packages/kit/package.json',
      JSON.stringify({
        name: '@astryxdesign/kit',
        description: 'A new kit.',
        private: true,
        astryx: {canaryOnly: true},
        exports: {'.': {source: './src/index.ts', default: './dist/index.js'}},
      }),
    );
    write(
      'packages/kit/astryx.integration.mjs',
      "export default {components: './src'};\n",
    );
    write(
      'packages/kit/src/index.ts',
      "export {Meter} from './Meter/Meter';\n",
    );
    write(
      'packages/kit/src/Meter/Meter.doc.mjs',
      "export default {type: 'component', name: 'Meter', props: [], usage: {description: 'x'}};\n",
    );
    write(
      'packages/kit/src/Meter/Meter.tsx',
      'export function Meter() { return null; }\n',
    );
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('lists a new official package from the repository alone', () => {
    const list = officialList({root, version: '0.9.0-canary.1'});
    expect(list.error).toBeUndefined();
    const kit = list.packages.find(p => p.package === '@astryxdesign/kit');
    expect(kit?.description).toBe('A new kit.');
    expect(kit?.contributions).toEqual([{kind: 'component', name: 'Meter'}]);
  });
});
