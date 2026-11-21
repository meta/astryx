// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A swizzled copy carries its own copy of Core's touch modules. The
 * package's and the copy's code must still share one gesture host, one set of
 * window input listeners and one click guard per page, so a copied component
 * and a package component do not each claim the same touches.
 */

import {describe, expect, it, vi} from 'vitest';

describe('the gesture host a swizzled copy shares', () => {
  it('gives two copies of the gesture modules one host per document', async () => {
    const pkg = await import('../GestureHost');
    vi.resetModules();
    const copy = await import('../GestureHost');
    expect(copy).not.toBe(pkg);
    expect(copy.getGestureHost(document)).toBe(pkg.getGestureHost(document));
  });
});

describe('the window input state a swizzled copy shares', () => {
  it('gives two copies of the input stream one window listener per event type', async () => {
    const pkg = await import('../../utils/inputStream');
    vi.resetModules();
    const copy = await import('../../utils/inputStream');
    expect(copy).not.toBe(pkg);
    const added = vi.spyOn(window, 'addEventListener');
    const heard: string[] = [];
    const stopPkg = pkg.subscribeInput(
      window,
      'keyup',
      () => void heard.push('pkg'),
    );
    const stopCopy = copy.subscribeInput(
      window,
      'keyup',
      () => void heard.push('copy'),
    );
    window.dispatchEvent(new KeyboardEvent('keyup'));
    expect(heard).toEqual(['pkg', 'copy']);
    expect(added.mock.calls.filter(([type]) => type === 'keyup')).toHaveLength(
      1,
    );
    stopPkg();
    stopCopy();
    added.mockRestore();
  });

  it('gives two copies of the click guard one guard per document', async () => {
    const pkg = await import('../../utils/clickGuard');
    vi.resetModules();
    const copy = await import('../../utils/clickGuard');
    expect(copy).not.toBe(pkg);
    pkg.armClickGuard(document);
    expect(copy.isClickGuardArmed(document)).toBe(true);
    copy.disarmClickGuard(document);
    expect(pkg.isClickGuardArmed(document)).toBe(false);
  });
});

describe('the state the shared gesture host reads', () => {
  it("lets a copy's layer holds reach the package's host", async () => {
    const pkg = await import('../../Layer/inputHold');
    vi.resetModules();
    const copy = await import('../../Layer/inputHold');
    expect(copy).not.toBe(pkg);
    const layer = document.createElement('div');
    const inside = document.createElement('span');
    layer.append(inside);
    document.body.append(layer);
    const release = copy.holdInput(layer, {
      until: new Promise(() => {}),
      scope: 'viewport',
    });
    expect(pkg.isInHeldLayer(inside)).toBe(true);
    release();
    layer.remove();
  });

  it("lets the package's host hit-test an element a copy moves", async () => {
    const pkg = await import('../../motion/presentation');
    vi.resetModules();
    const copy = await import('../../motion/presentation');
    expect(copy).not.toBe(pkg);
    const element = document.createElement('div');
    const stop = copy.registerPresentedOffset(element, {
      offset: () => ({x: 0, y: 0}),
      resolve: () => {},
    });
    expect(pkg.presentedElements()).toContain(element);
    stop();
  });
});
