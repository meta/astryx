// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The built-in value index must not depend on the order docs load in.
 *
 * A parent doc can list a sub-component by name only (`Avatar.doc.mjs` lists
 * `{name: 'AvatarStatusDot'}`), while the sub-component's own doc declares its
 * props. This file lists every directory in reverse name order, which forces
 * the parent doc to load after the sub-component doc that declares the values.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {themeBuild} from './build.mjs';

vi.mock('node:fs', async importOriginal => {
  const actual = /** @type {typeof import('node:fs')} */ (
    await importOriginal()
  );
  /** @param {string | {name: string}} entry */
  const nameOf = entry => (typeof entry === 'string' ? entry : entry.name);
  /** @type {typeof actual.readdirSync} */
  const readdirSync = /** @type {any} */ (
    (/** @type {any[]} */ ...args) =>
      /** @type {any[]} */ (
        /** @type {any} */ (actual.readdirSync)(...args)
      ).sort((a, b) => nameOf(b).localeCompare(nameOf(a)))
  );
  return {...actual, default: {...actual, readdirSync}, readdirSync};
});

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-known-values-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * @param {string} name
 * @param {string} body
 */
async function build(name, body) {
  fs.writeFileSync(
    path.join(tmpDir, `${name}.mjs`),
    `export default {
      name: '${name}',
      tokens: {'--color-background-body': '#fff'},
      ${body}
    };\n`,
  );
  return themeBuild(`${name}.mjs`, {}, {cwd: tmpDir});
}

describe('a sub-component value its own doc declares is built in', () => {
  it('the root styles it without generating augmentation', async () => {
    const receipt = await build(
      'root-builtin',
      `components: {'avatar-status-dot': {'variant:success': {color: 'red'}}},`,
    );

    expect(receipt?.type).toBe('theme.build');
    expect(receipt?.data?.outputs?.variantsDts).toBeFalsy();
  });

  it('an adaptation rule restyles it without a root declaration', async () => {
    const receipt = await build(
      'rule-builtin',
      `adaptations: {
        rules: [
          {
            when: {pointer: 'coarse'},
            value: {
              components: {
                'avatar-status-dot': {'variant:success': {color: 'red'}},
              },
            },
          },
        ],
      },`,
    );

    expect(receipt?.type).toBe('theme.build');
    expect(receipt?.data?.outputs?.variantsDts).toBeFalsy();
  });
});
