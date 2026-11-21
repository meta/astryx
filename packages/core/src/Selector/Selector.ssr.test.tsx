// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.ssr.test.tsx
 * @input Selector server markup and React hydration
 * @output Proves a bottom-sheet Selector hydrates without a recoverable
 *   error or a console error while its on-demand sheet has not loaded
 * @position SSR acceptance test for Selector; it waits for the on-demand
 *   sheet module each hydration starts, so none loads after teardown
 */

import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import './Selector';
import './SelectorBottomSheet';
import './SelectorBottomSheetFrame';

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
  const {Selector} = await import('./Selector');
  const tree = (
    <Selector
      label="Choose"
      presentation="bottom-sheet"
      options={['Apple', 'Banana', 'Cherry']}
      onChange={() => {}}
    />
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.appendChild(container);

  const logged = vi.spyOn(console, 'error');
  const recoverableErrors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: error => recoverableErrors.push(error),
    });
  });
  await act(async () => {
    await import('./SelectorBottomSheetFrame');
  });
  await act(async () => {
    root.unmount();
  });
  container.remove();
  const consoleErrors = [...logged.mock.calls];
  logged.mockRestore();
  return {recoverableErrors, consoleErrors};
}

describe('Selector — SSR', () => {
  it('hydrates a bottom-sheet selector cleanly on the first renders of a server process', async () => {
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
