// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenu.ssr.test.tsx
 * @input DropdownMenu server markup and React hydration
 * @output Proves a bottom-sheet DropdownMenu hydrates without a recoverable
 *   error or a console error while its on-demand sheet has not loaded
 *   (spec:AST-013 FR9)
 * @position SSR acceptance test for DropdownMenu; it waits for the on-demand
 *   sheet modules each hydration starts, so none loads after teardown
 */

import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
// The menu and its on-demand sheet, loaded while this file is collected,
// which is untimed: a first load can take seconds on a busy machine. Each
// fresh module graph below runs these modules again without that cost.
import './DropdownMenu';
import './MenuBottomSheet';
import './MenuBottomSheetActionList';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** What a hydration reported: its recoverable errors and its console errors. */
interface Hydration {
  recoverableErrors: unknown[];
  consoleErrors: unknown[][];
}

async function serverRenderThenHydrate(): Promise<Hydration> {
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

  // Watched, not muted: React reports some mismatches (an attribute that
  // differs, for one) only on the console.
  const logged = vi.spyOn(console, 'error');
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
  const consoleErrors = [...logged.mock.calls];
  logged.mockRestore();
  return {recoverableErrors, consoleErrors};
}

describe('DropdownMenu — SSR', () => {
  it('hydrates a bottom-sheet menu cleanly on the first renders of a server process', async () => {
    expect(await serverRenderThenHydrate()).toEqual({
      recoverableErrors: [],
      consoleErrors: [],
    });
    expect(await serverRenderThenHydrate()).toEqual({
      recoverableErrors: [],
      consoleErrors: [],
    });
    expect(await serverRenderThenHydrate()).toEqual({
      recoverableErrors: [],
      consoleErrors: [],
    });
  }, 30000);
});
