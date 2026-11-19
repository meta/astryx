// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.swipeLayer.test.tsx
 * @input Item with and without swipe actions; the swipe layer modules, spied
 * @output Verifies a row without swipe actions never renders the swipe layer. A
 *   row given `swipe` renders it into the root at its first render, under a
 *   fine primary pointer as under a phone's
 * @position Companion to Item.test.tsx for where the swipe layer comes from;
 *   Item.deprecatedSwipeLayer.test.tsx covers the deprecated props' loader
 */

import {createElement, type ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import {Item} from './Item';
import {createSwipe} from '../Swipe/createSwipe';
import type {SwipeLayerProps} from '../Swipe/swipeHost';
import {emulateTouch} from './__tests__/emulateTouch';

const {layerRenders} = vi.hoisted(() => ({layerRenders: vi.fn()}));

vi.mock('../Swipe/SwipeActionsLayer', async importOriginal => {
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

describe('Item and the swipe layer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    layerRenders.mockClear();
  });

  it('renders a row without swipe actions with no swipe layer at all', async () => {
    render(
      <ul>
        <Item
          as="li"
          label="Inbox"
          description="12 unread"
          onClick={() => {}}
        />
        <Item as="li" label="Drafts" href="/drafts" data-testid="row" />
        <Item as="li" label="Archive" />
      </ul>,
    );
    // Let anything the first render scheduled — a lazy chunk resolving, an
    // effect — run before looking.
    await act(async () => {});
    expect(layerRenders).not.toHaveBeenCalled();
    expect(document.querySelector('[data-swipe-panel]')).toBeNull();
    expect(screen.getByTestId('row').childElementCount).toBe(1);
  });

  it('renders the layer of a row given swipe at its first render, under a fine primary pointer too', () => {
    // A touchscreen laptop: a fine primary pointer, and a finger beside it.
    // The gesture reads each touch's pointer, so the layer is there; a mouse
    // never starts it (Item.test.tsx).
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    render(
      <Item
        label="Inbox"
        data-testid="row"
        swipe={createSwipe({
          trailing: [{id: 'archive', label: 'Archive', onActivate: () => {}}],
        })}
      />,
    );
    // No chunk to wait for: the layer came with createSwipe.
    expect(
      screen.getByTestId('row').querySelector('[data-swipe-panel="trailing"]'),
    ).not.toBeNull();
    expect(layerRenders).toHaveBeenCalled();
  });

  it("renders the layer into the root of a row given swipe on a phone's pointer, adding nothing else", () => {
    emulateTouch();
    render(
      <Item
        label="Inbox"
        data-testid="row"
        swipe={createSwipe({
          trailing: [{id: 'archive', label: 'Archive', onActivate: () => {}}],
        })}
      />,
    );
    const row = screen.getByTestId('row');
    const panel = row.querySelector('[data-swipe-panel="trailing"]');
    // The layer adds nothing but the panel: the root is still the content
    // followed by the out-of-flow panel, with no wrapper for either.
    expect(panel?.parentElement).toBe(row);
    expect(row.childElementCount).toBe(2);
  });
});
