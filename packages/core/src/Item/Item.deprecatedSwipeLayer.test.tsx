// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.deprecatedSwipeLayer.test.tsx
 * @input Item with the deprecated `swipeActions`; the swipe layer module,
 *   held until a test releases it, and spied
 * @output Verifies a row given the deprecated `swipeActions` takes the released
 *   row style at once. It renders the layer once its loader has brought it,
 *   however long the load takes
 * @position Companion to Item.swipeLayer.test.tsx. Its own file, because the
 *   held module would also hold any import of createSwipe here
 */

import * as stylex from '@stylexjs/stylex';
import {createElement, type ReactNode} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Item} from './Item';
import type {SwipeLayerProps} from '../Swipe/swipeHost';
import {swipeHostStyles} from '../Swipe/swipeHost.stylex';
import {emulateTouch} from './__tests__/emulateTouch';
import {swipeLayerLoaded} from './__tests__/swipeLayerLoaded';

const {layerRenders, layerLoad} = vi.hoisted(() => {
  let release = () => {};
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  return {layerRenders: vi.fn(), layerLoad: {held, release: () => release()}};
});

vi.mock('../Swipe/SwipeActionsLayer', async importOriginal => {
  // The module loads only when the test releases it. A cold load on a loaded
  // machine is as late, so a wait on a clock would read nothing.
  await layerLoad.held;
  const actual = await importOriginal<{
    default: (props: SwipeLayerProps) => ReactNode;
  }>();
  return {
    ...actual,
    default: (props: SwipeLayerProps) => {
      layerRenders();
      return createElement(actual.default, props);
    },
  };
});

describe('Item and the deprecated swipe layer (spec:AST-057 DEP-0017)', () => {
  it('gives a row the deprecated swipeActions the released row style at its first render, before its chunk loads', () => {
    render(
      <>
        <Item
          label="A"
          data-testid="deprecated"
          swipeActions={{
            trailing: [{id: 'archive', label: 'Archive', onActivate: () => {}}],
          }}
        />
        <Item label="A" data-testid="plain" />
      </>,
    );
    const deprecated = screen.getByTestId('deprecated');
    // The style is there before the layer, so nothing on the page reorders
    // when the chunk arrives.
    expect(deprecated.querySelector('[data-swipe-panel]')).toBeNull();
    const rootClasses = (stylex.props(swipeHostStyles.root).className ?? '')
      .split(' ')
      .filter(Boolean);
    expect(rootClasses.length).toBeGreaterThan(0);
    for (const name of rootClasses) {
      expect(deprecated.classList).toContain(name);
      expect(screen.getByTestId('plain').classList).not.toContain(name);
    }
  });

  it('renders the layer of a row given the deprecated swipeActions once its chunk has loaded', async () => {
    emulateTouch();
    render(
      <Item
        label="Inbox"
        data-testid="row"
        swipeActions={{
          trailing: [{id: 'archive', label: 'Archive', onActivate: () => {}}],
        }}
      />,
    );
    const row = screen.getByTestId('row');
    // The layer's module is still loading: nothing is drawn yet.
    expect(row.querySelector('[data-swipe-panel]')).toBeNull();
    layerLoad.release();
    await swipeLayerLoaded(row);
    const panel = row.querySelector('[data-swipe-panel="trailing"]');
    expect(panel).not.toBeNull();
    expect(layerRenders).toHaveBeenCalled();
    expect(panel?.parentElement).toBe(row);
    expect(row.childElementCount).toBe(2);
    vi.unstubAllGlobals();
  });
});
