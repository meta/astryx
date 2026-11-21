// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file shared-identity.pins.test.mjs
 * @input The swizzle copy of the components whose baseline entries are
 *   allowed because no copy splits them
 * @output Fails when a swizzle copy starts to carry a module the baseline
 *   allows on the grounds that copies never carry it, or carries a store
 *   without the code that writes it (spec:AST-110 FR3)
 * @position Node test; pins the reasons of allowed baseline entries
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';

import {REPO} from './shared-identity.mjs';

// A workspace app that depends on every component package, so swizzle finds
// the integrations as a product would.
const PROJECT = path.join(REPO, 'apps/storybook');
const OUT = path.join('node_modules', '.swizzle-pins', String(process.pid));

/** Every file a swizzle copy of `name` writes, relative to the output. */
async function copiedFiles(name, pkg) {
  const {swizzle} = await import(
    path.join(REPO, 'packages/cli/api/swizzle/swizzle.mjs')
  );
  const output = path.join(OUT, name);
  await swizzle(name, {
    cwd: PROJECT,
    output,
    ...(pkg ? {package: pkg} : {}),
  });
  const root = path.join(PROJECT, output);
  return fs
    .readdirSync(root, {recursive: true})
    .map(String)
    .filter(file => fs.statSync(path.join(root, file)).isFile());
}

afterAll(() => {
  fs.rmSync(path.join(PROJECT, OUT), {recursive: true, force: true});
});

describe('reasons the baseline gives for allowed entries', () => {
  it('copies List without createReorderable.ts', async () => {
    // reorderable/createReorderable.ts:reorderableBrand is allowed because
    // copies import createReorderable from the package's public path.
    const files = await copiedFiles('List');
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter(file => file.endsWith('createReorderable.ts'))).toEqual(
      [],
    );
  });

  it('copies the code that sets the extension decorators with the store', async () => {
    // markdownExtensionNode.ts:decorators is allowed because a copy's editor
    // sets and reads it: every module that sets a decorator travels with it.
    const setters = fs
      .readdirSync(path.join(REPO, 'packages/richtext/src'))
      .filter(
        file =>
          /\.tsx?$/.test(file) &&
          !/\.test\.tsx?$/.test(file) &&
          fs
            .readFileSync(
              path.join(REPO, 'packages/richtext/src', file),
              'utf8',
            )
            .includes('setRichTextExtensionNodeDecorator('),
      );
    expect(setters.length).toBeGreaterThan(0);
    for (const name of ['RichTextEditor', 'RichTextView']) {
      const files = (await copiedFiles(name, '@astryxdesign/richtext')).map(
        file => path.basename(file),
      );
      if (!files.includes('markdownExtensionNode.ts')) continue;
      for (const setter of setters) {
        expect(files, `${name} copies ${setter}`).toContain(setter);
      }
    }
  });
});
