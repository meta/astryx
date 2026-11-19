// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file cutTextOnKeyboardFocus.exports.test.ts
 * @input The core package's root, Text and internal line-clamp entry points
 *   and its package exports
 * @output Proof that useCutTextOnKeyboardFocus stays internal: no entry point
 *   and no package export reaches it
 * @position Export lock for useCutTextOnKeyboardFocus in
 *   /packages/core/src/Text/TruncationTooltip.tsx
 */

import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import * as core from '../index';
import * as lineClamp from '../internal/line-clamp';
import * as text from './index';

const HOOK = 'useCutTextOnKeyboardFocus';

describe('the keyboard-focus cut-text hook is internal to core', () => {
  it('is not exported from any entry point', () => {
    expect(Object.keys(core)).not.toContain(HOOK);
    expect(Object.keys(text)).not.toContain(HOOK);
    expect(Object.keys(lineClamp)).not.toContain(HOOK);
  });

  it('has no package export of its own', () => {
    const manifest = readFileSync(
      resolve(__dirname, '../../package.json'),
      'utf8',
    );
    expect(manifest).not.toContain(HOOK);
  });
});
