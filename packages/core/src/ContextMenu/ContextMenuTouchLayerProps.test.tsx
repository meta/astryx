// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuTouchLayerProps.test.tsx
 * @input ContextMenu under a coarse pointer, with its touch layer replaced
 * @output Checks what ContextMenu asks of its touch layer: a block trigger
 *   grows, and a trigger whose menu is a bottom sheet does not
 * @position Unit tests of packages/core/src/ContextMenu/ContextMenu.tsx
 */

import {render, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ContextMenu} from './ContextMenu';
import {ContextMenuTouchLayer} from './ContextMenuTouchLayer';

vi.mock('./ContextMenuTouchLayer', () => ({
  ContextMenuTouchLayer: vi.fn(() => null),
}));

function stubCoarsePointer() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe('ContextMenu and its touch layer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(ContextMenuTouchLayer).mockClear();
  });

  async function shownProp(presentation?: 'bottom-sheet') {
    stubCoarsePointer();
    render(
      <ContextMenu items={[{label: 'Cut'}]} presentation={presentation}>
        <div>Hold me</div>
      </ContextMenu>,
    );
    await waitFor(() => {
      expect(ContextMenuTouchLayer).toHaveBeenCalled();
    });
    return vi.mocked(ContextMenuTouchLayer).mock.lastCall?.[0].isShown;
  }

  it('grows a block trigger whose menu is anchored to it', async () => {
    expect(await shownProp()).toBe(true);
  });

  it('does not grow a trigger whose menu is a bottom sheet', async () => {
    expect(await shownProp('bottom-sheet')).toBe(false);
  });
});
