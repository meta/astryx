// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resizable.shared.test.ts
 * @input Two loads of the Resizable modules, as the package and a swizzled
 *   copy each carry one
 * @output Proves a copy reads a controller the package made, finds a pane the
 *   package lent beside a handle, and hears the package's pane changes
 * @position Shared-state tests for createResizable.ts and resizablePane.ts
 *   (spec:AST-110 FR3)
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

/** One load of a module, as the package or a copy has. */
async function load<T>(importModule: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return importModule();
}

afterEach(async () => {
  (await import('../utils/sharedRealm')).resetSharedStateForTest('resizable/');
  vi.resetModules();
});

describe('Resizable state shared by the package and a swizzled copy', () => {
  it("reads the internals of a controller the package's createResizable made", async () => {
    const pkg = await load(async () => import('./createResizable'));
    const copy = await load(async () => import('./createResizable'));
    const handle = document.createElement('div');
    document.body.append(handle);
    const controller = pkg.createResizable(handle, {defaultSize: 240});
    expect(copy.readResizableInternals(controller)).toBeDefined();
    controller.destroy();
    handle.remove();
  });

  it("tells a copy's watcher when the package lends a pane", async () => {
    const pkg = await load(async () => import('./resizablePane'));
    const copy = await load(async () => import('./resizablePane'));
    const watcher = vi.fn();
    const stop = copy.watchResizablePanes(watcher);
    const row = document.createElement('div');
    const panel = document.createElement('div');
    const handle = document.createElement('div');
    row.append(panel, handle);
    document.body.append(row);
    const unregister = pkg.registerResizeHandle(handle);
    const link = pkg.createResizablePaneLink();
    link.attach(panel, true);
    expect(watcher).toHaveBeenCalled();
    expect(copy.resizablePaneFor(handle, false)).not.toBeNull();
    link.attach(null, true);
    unregister();
    stop();
    row.remove();
  });
});
