// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `render()` where the CLI's install left esbuild out: it refuses
 * through the API and writes nothing, since every render carries the page's
 * script.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {render} from './render.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

vi.mock(
  '../../foundation/render/esbuild-dependency.mjs',
  async importOriginal => ({
    .../** @type {object} */ (await importOriginal()),
    findEsbuild: () => null,
  }),
);

/** @type {string} */
let dir;

beforeAll(() => {
  dir = makeLinkedFixture('astryx-render-no-esbuild-', [
    '@astryxdesign',
    '@stylexjs',
    'react',
    'react-dom',
  ]);
  fs.writeFileSync(
    path.join(dir, 'page.tsx'),
    'export default function Page() {\n  return <button>Go</button>;\n}\n',
  );
});

afterAll(() => {
  removeLinkedFixture(dir);
});

describe('render() when the install left esbuild out', () => {
  it('refuses, says why, and writes nothing', async () => {
    let error;
    try {
      await render('page.tsx', {cwd: dir, out: 'page.html'});
    } catch (e) {
      error = /** @type {any} */ (e);
    }
    expect(error?.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(error?.message).toContain('esbuild');
    expect(error?.message).toContain('nothing was written');
    expect(fs.existsSync(path.join(dir, 'page.html'))).toBe(false);
  });
});
