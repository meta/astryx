// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `render()` with `interactive` where no esbuild it can use is
 * installed: it refuses through the API, with the install command as its
 * suggestion, and writes nothing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {render} from './render.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

vi.mock('../../foundation/render/esbuild-peer.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  findEsbuild: () => null,
}));

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

describe('render() with interactive and no esbuild', () => {
  it('refuses with the install command as its suggestion, and writes nothing', async () => {
    let error;
    try {
      await render('page.tsx', {cwd: dir, out: 'page.html', interactive: true});
    } catch (e) {
      error = /** @type {any} */ (e);
    }
    expect(error?.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(error?.message).toContain('nothing was written');
    expect(error?.suggestions?.[0]?.name).toMatch(
      /^(npm install|pnpm add|yarn add|bun add) esbuild/,
    );
    expect(error?.suggestions?.[0]?.reason).toContain('esbuild');
    expect(fs.existsSync(path.join(dir, 'page.html'))).toBe(false);
  });
});
