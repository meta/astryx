// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The layout-language registry over the real @astryxdesign/core tree:
 * the import path it emits for each component.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRegistry} from './registry.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('buildRegistry import paths', () => {
  it('keeps the Stack family on the paths it registers from Stack\'s folder', async () => {
    // HStack and VStack are listed components whose docs live in Stack's doc.
    // Listing them must not let their folders re-register the family under
    // their own paths: a member's folder registers nothing, Stack's does.
    const {components} = await buildRegistry({cwd: REPO});
    const importOf = (/** @type {string} */ name) => components.get(name)?.importPath;
    for (const name of ['Stack', 'StackItem', 'HStack', 'VStack']) {
      expect(importOf(name), name).toBe('@astryxdesign/core/Stack');
    }
    expect(importOf('Heading')).toBe('@astryxdesign/core/Heading');
    expect(importOf('Text')).toBe('@astryxdesign/core/Text');
  }, 120_000);
});
