// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layers.shared.test.ts
 * @input Two loads of the layer modules, as the package and a swizzled copy
 *   each carry one
 * @output Proves both loads see one layer stack, one gesture counter, one
 *   record of outside dismissals, one set of layer surfaces and one set of
 *   press-claim watchers
 * @position Shared-state tests for the Layer runtime (spec:AST-110 FR3)
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

/** One load of a module, as the package or a copy has. */
async function load<T>(importModule: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return importModule();
}

afterEach(async () => {
  (await import('./layerStack')).resetLayerStackForTests();
  (await import('../utils/sharedRealm')).resetSharedStateForTest('layer/');
  vi.resetModules();
});

describe('the layer runtime, shared by the package and a swizzled copy', () => {
  it("puts a copy's layer above the package's layer in one stack", async () => {
    const pkg = await load(async () => import('./layerStack'));
    const copy = await load(async () => import('./layerStack'));
    const below = {};
    const above = {};
    const offPkg = pkg.registerLayer({
      token: below,
      depth: 0,
      behavior: 'close',
      dismiss: () => {},
    });
    const offCopy = copy.registerLayer({
      token: above,
      depth: 1,
      behavior: 'close',
      dismiss: () => {},
    });
    expect(pkg.isTopmostLayer(below)).toBe(false);
    expect(pkg.isTopmostLayer(above)).toBe(true);
    offCopy();
    expect(pkg.isTopmostLayer(below)).toBe(true);
    offPkg();
  });

  it("removes the document's listeners when the other load closes the last layer", async () => {
    const pkg = await load(async () => import('./layerStack'));
    const copy = await load(async () => import('./layerStack'));
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const offPkg = pkg.registerLayer({
      token: {},
      depth: 0,
      behavior: 'close',
      dismiss: () => {},
    });
    const offCopy = copy.registerLayer({
      token: {},
      depth: 1,
      behavior: 'close',
      dismiss: () => {},
    });
    // The package opened the document's first layer; the copy closes its last.
    offPkg();
    offCopy();
    const keydownListeners = (spy: typeof added) =>
      spy.mock.calls
        .filter(([type]) => type === 'keydown')
        .map(([, listener]) => listener);
    expect(keydownListeners(added)).toHaveLength(1);
    expect(keydownListeners(removed)).toEqual(keydownListeners(added));
    added.mockRestore();
    removed.mockRestore();
  });

  it('reads one gesture counter from both loads', async () => {
    const pkg = await load(async () => import('./gestureCounter'));
    const copy = await load(async () => import('./gestureCounter'));
    const start = pkg.currentGesture();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'a'}));
    expect(copy.currentGesture()).toBe(pkg.currentGesture());
    expect(pkg.currentGesture()).toBe(start + 1);
  });

  it("counts a copy's outside dismissal for the package", async () => {
    const pkg = await load(async () => import('./outsidePress'));
    const copy = await load(async () => import('./outsidePress'));
    const before = pkg.outsideDismissalCount(document);
    copy.noteOutsideDismissal(document);
    expect(pkg.outsideDismissalCount(document)).toBe(before + 1);
  });

  it('recognizes a layer surface a copy registered', async () => {
    const pkg = await load(async () => import('./layerSurfacePress'));
    const copy = await load(async () => import('./layerSurfacePress'));
    const surface = document.createElement('div');
    copy.registerLayerSurface(surface);
    expect(pkg.isLayerSurface(surface)).toBe(true);
  });

  it("tells a copy's watcher about a press the package claimed", async () => {
    const pkg = await load(async () => import('../utils/pressClaim'));
    const copy = await load(async () => import('../utils/pressClaim'));
    const watcher = vi.fn();
    const stop = copy.watchPressClaims(watcher);
    pkg.claimPress();
    expect(watcher).toHaveBeenCalledTimes(1);
    stop();
  });
});
