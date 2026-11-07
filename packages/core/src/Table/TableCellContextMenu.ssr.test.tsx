// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TableCellContextMenu.ssr.test.tsx
 * @input Table cell server markup and React hydration
 * @output Proves body and header cells with context actions hydrate without a
 *   recoverable error or a console error while the menu has not loaded
 *   (spec:AST-013 FR9)
 * @position SSR acceptance test for TableCellContextMenu; it waits for the
 *   menu module each hydration starts, so none loads after teardown
 */

import {act} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
// Vitest loads these while it collects this file, which is untimed. Each
// fresh module graph below runs these modules again without that cost.
import './Table';
import './tableContextMenu';
import type {TableContextAction} from './types';

const actions: TableContextAction[] = [
  {id: 'copy', label: 'Copy', onSelect: () => {}},
];

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

interface Hydration {
  recoverableErrors: unknown[];
  consoleErrors: unknown[][];
}

async function serverRenderThenHydrate(): Promise<Hydration> {
  // A fresh module graph is a fresh server process: the menu has not loaded.
  vi.resetModules();
  const [{Table}, {TableHeader}, {TableBody}, {TableRow}, cells] =
    await Promise.all([
      import('./Table'),
      import('./TableHeader'),
      import('./TableBody'),
      import('./TableRow'),
      Promise.all([import('./TableCell'), import('./TableHeaderCell')]),
    ]);
  const [{TableCell}, {TableHeaderCell}] = cells;
  const tree = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHeaderCell contextMenuActions={actions}>Name</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell contextMenuActions={actions}>Alice</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.appendChild(container);

  // Watched, not muted: React reports some mismatches only on the console.
  const logged = vi.spyOn(console, 'error');
  const recoverableErrors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: error => recoverableErrors.push(error),
    });
  });
  // Right after hydration the cells start loading the menu. Finish that load
  // before the test ends, or it resolves after the environment is torn down.
  await act(async () => {
    await import('./tableContextMenu');
  });
  await act(async () => {
    root.unmount();
  });
  container.remove();
  const consoleErrors = [...logged.mock.calls];
  logged.mockRestore();
  return {recoverableErrors, consoleErrors};
}

describe('TableCellContextMenu — SSR', () => {
  it('hydrates body and header cells with actions cleanly on the first renders of a server process', async () => {
    for (let render = 0; render < 3; render++) {
      expect(await serverRenderThenHydrate()).toEqual({
        recoverableErrors: [],
        consoleErrors: [],
      });
    }
  }, 30000);
});
