// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuSheetFirstOpen.test.tsx
 * @input vitest (jsdom), Testing Library, DropdownMenu, module mocks that
 *   record when the lazily loaded sheet modules are requested and loaded
 * @output Checks that a bottom-sheet DropdownMenu loads its sheet and rows at
 *   rest, so the first open renders the actions in the same commit, cold (no
 *   warm-up)
 * @position Testing for DropdownMenu.tsx and lazyMenuBottomSheet.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, expect, it, vi} from 'vitest';
import {DropdownMenu} from './DropdownMenu';
import type * as MenuBottomSheetModule from './MenuBottomSheet';
import type * as ActionListModule from './MenuBottomSheetActionList';

const modules = vi.hoisted(() => ({
  requested: new Set<string>(),
  loaded: new Set<string>(),
}));

vi.mock('./MenuBottomSheet', async importOriginal => {
  modules.requested.add('sheet');
  const module = await importOriginal<typeof MenuBottomSheetModule>();
  modules.loaded.add('sheet');
  return module;
});

vi.mock('./MenuBottomSheetActionList', async importOriginal => {
  modules.requested.add('rows');
  const module = await importOriginal<typeof ActionListModule>();
  modules.loaded.add('rows');
  return module;
});

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

it('loads the sheet and its rows at rest, so the first open renders the actions in the same commit', async () => {
  render(
    <DropdownMenu
      button={{label: 'Project actions'}}
      presentation="bottom-sheet"
      items={[{label: 'Edit project'}, {label: 'Archive'}]}
    />,
  );
  // Closed, the sheet renders nothing, yet both modules load.
  expect(document.querySelector('dialog')).toBeNull();
  await vi.waitFor(
    () => {
      expect([...modules.loaded].sort()).toEqual(['rows', 'sheet']);
    },
    {timeout: 15000},
  );

  // The rows render in the same commit as the opening: nothing suspends.
  act(() => {
    fireEvent.click(screen.getByRole('button', {name: /Project actions/}));
  });
  expect(screen.getByRole('button', {name: 'Edit project'})).toBeVisible();
  expect(screen.getByRole('button', {name: 'Archive'})).toBeVisible();
}, 20000);
