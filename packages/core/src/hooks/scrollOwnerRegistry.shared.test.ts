// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollOwnerRegistry.shared.test.ts
 * @input Two loads of scrollOwnerRegistry, as the package's ScrollableArea and
 *   a swizzled AppShell (or the reverse) each carry one
 * @output Proves a scroll owner one load registers is the owner the other load
 *   finds, so keyboard delegation yields to it
 * @position Shared-state test for scrollOwnerRegistry.ts (spec:AST-110 FR3)
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

/** One load of the module, as the package or a copy has. */
async function load() {
  vi.resetModules();
  return import('./scrollOwnerRegistry');
}

afterEach(async () => {
  (await import('../utils/sharedRealm')).resetSharedStateForTest('hooks/');
  vi.resetModules();
});

const scrollable = {isScrollable: true, atStart: true, atEnd: false};
const still = {isScrollable: false, atStart: true, atEnd: true};

describe('scroll owners shared by the package and a swizzled copy', () => {
  it('finds the scroll owner the other load registered', async () => {
    const pkg = await load();
    const copy = await load();
    const owner = document.createElement('div');
    const content = document.createElement('p');
    owner.append(content);
    document.body.append(owner);
    pkg.registerScrollOwner(owner, {inline: still, block: scrollable});
    expect(copy.getRegisteredScrollOwnerState(owner)).toBeDefined();
    expect(copy.findNearestScrollOwner(content, 'block')).toBe(owner);
    copy.unregisterScrollOwner(owner);
    expect(pkg.getRegisteredScrollOwnerState(owner)).toBeUndefined();
    owner.remove();
  });
});
