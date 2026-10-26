// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenu.ssr.test.tsx
 * @input DropdownMenu server markup and React hydration
 * @output Proves a bottom-sheet DropdownMenu hydrates without a recoverable
 *   error while its on-demand sheet has not loaded (spec:AST-013 FR9)
 * @position SSR acceptance test for DropdownMenu; it waits for the on-demand
 *   sheet modules each hydration starts, so none loads after teardown
 */

import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function serverRenderThenHydrate(): Promise<unknown[]> {
  // A fresh module graph is a fresh server process: the sheet has not loaded.
  vi.resetModules();
  const {DropdownMenu} = await import('./DropdownMenu');
  const tree = (
    <DropdownMenu
      button={{label: 'Actions'}}
      presentation="bottom-sheet"
      items={[{label: 'Edit project'}, {label: 'Delete'}]}
    />
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.appendChild(container);

  vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: error => recoverableErrors.push(error),
    });
  });
  // Right after hydration the sheet wrappers render and start loading the
  // sheet on demand. Finish those loads before the test ends, or they
  // resolve after this file's environment is torn down.
  await act(async () => {
    await Promise.all([
      import('./MenuBottomSheet'),
      import('./MenuBottomSheetActionList'),
    ]);
  });
  await act(async () => {
    root.unmount();
  });
  container.remove();
  return recoverableErrors;
}

describe('DropdownMenu — SSR', () => {
  it('hydrates a bottom-sheet menu cleanly on the first renders of a server process', async () => {
    expect(await serverRenderThenHydrate()).toEqual([]);
    expect(await serverRenderThenHydrate()).toEqual([]);
    expect(await serverRenderThenHydrate()).toEqual([]);
  }, 30000);
});
