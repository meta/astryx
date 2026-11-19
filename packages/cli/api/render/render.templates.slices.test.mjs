// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The template slices render every ready page template exactly once: the
 * registry decides the list, so a new template lands in a slice by itself.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {template} from '../template/template.mjs';
import {templateSlice} from '../../test-utils/render-template-slices.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Each slice file's `describeTemplateSlice(slice, count)` call. */
function sliceFiles() {
  return fs
    .readdirSync(HERE)
    .filter(name => /^render\.templates\.\d+\.test\.mjs$/.test(name))
    .map(name => {
      const m = /describeTemplateSlice\((\d+), (\d+)\)/.exec(
        fs.readFileSync(path.join(HERE, name), 'utf8'),
      );
      return {name, slice: Number(m?.[1]), count: Number(m?.[2])};
    });
}

describe('render(): the template slices', () => {
  /** @type {string} */
  let home;

  beforeAll(() => {
    home = makeLinkedFixture('astryx-render-slices-', [
      '@astryxdesign',
      'react',
      'react-dom',
    ]);
  });

  afterAll(() => {
    removeLinkedFixture(home);
  });

  it('are files for slices 1 to N of the same N', () => {
    const files = sliceFiles();
    const count = files[0]?.count;
    expect(files.length).toBeGreaterThan(0);
    expect(files.every(f => f.count === count)).toBe(true);
    expect(files.map(f => f.slice).sort((a, b) => a - b)).toEqual(
      Array.from({length: count}, (_, i) => i + 1),
    );
  });

  it('hold every ready page template the registry lists, each in one slice', async () => {
    const listed = /** @type {any} */ (
      await template(undefined, {list: true, type: 'page', cwd: home})
    );
    /** @type {string[]} */
    const ready = listed.data
      .filter((/** @type {any} */ t) => t.isReady)
      .map((/** @type {any} */ t) => t.id);
    expect(ready.length).toBeGreaterThan(0);
    const count = sliceFiles()[0].count;
    const held = Array.from({length: count}, (_, i) =>
      templateSlice(ready, i + 1, count),
    ).flat();
    expect(held.sort()).toEqual([...ready].sort());
    expect(new Set(held).size).toBe(held.length);
  });
});
