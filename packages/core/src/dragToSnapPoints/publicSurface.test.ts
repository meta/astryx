// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file publicSurface.test.ts
 * @input Core's package.json, the package root's source, this directory
 * @output Checks `spec:AST-107` FR2 and FR6 for the snap-point drag's entry:
 *   `createDragToSnapPoints` ships from the package root only (no subpath of
 *   its own, one API with one entry), as `createAnimator` does, and its hook
 *   from the hooks barrel
 * @position Public API test; enforced by Vitest
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = path.join(__dirname, '..');

describe('the snap-point drag\u2019s entry', () => {
  it('createDragToSnapPoints ships from the package root only: no `./dragToSnapPoints` subpath', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(SRC, '..', 'package.json'), 'utf8'),
    ) as {exports: Record<string, unknown>};
    expect(Object.keys(pkg.exports)).not.toContain('./dragToSnapPoints');
    expect(fs.existsSync(path.join(__dirname, 'index.ts'))).toBe(false);
    const root = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
    expect(root).toContain("from './dragToSnapPoints/createDragToSnapPoints';");
  });

  it('the hooks barrel hands out useDragToSnapPoints', () => {
    const hooks = fs.readFileSync(path.join(SRC, 'hooks', 'index.ts'), 'utf8');
    expect(hooks).toMatch(/useDragToSnapPoints/);
  });
});
