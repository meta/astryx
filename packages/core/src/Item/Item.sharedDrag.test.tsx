// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Item.sharedDrag.test.tsx
 * @input Item with swipe actions; the shared snap-point drag
 *   (createSnapDrag.ts), spied to read what the row hands it
 * @output Verifies the row's swipe runs the shared drag path and declares
 *   only its stops and actions there (`spec:AST-094` FR43, DEC-24;
 *   `spec:AST-057`): the row's travel is the shared drag's, drawn into the
 *   row's custom property (`spec:AST-057` FR2); the pan takes a finger, a
 *   pen and a trackpad's scroll, never a mouse; a side's stops are rest, the
 *   open width and out past the row's edge; a trackpad's drag follows one for
 *   one and its release settles on the shared settle spring from the
 *   fingers' speed; a finger's drag keeps `spec:AST-057`'s UIKit model (the
 *   dead zone and the tracking spring), the one model the row adds
 * @position Companion to Item.test.tsx for the shared drag path
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {Item} from './Item';
import type * as SnapDragModule from '../dragToSnapPoints/createSnapDrag';
import type {
  SnapDrag,
  SnapDragOptions,
} from '../dragToSnapPoints/createSnapDrag';
import {swipeActions as SWIPE} from '../motion/uikit/swipeActions';

const {created} = vi.hoisted(() => ({
  created: [] as {options: SnapDragOptions; snap: SnapDrag}[],
}));

vi.mock('../dragToSnapPoints/createSnapDrag', async importOriginal => {
  const actual = await importOriginal<typeof SnapDragModule>();
  return {
    ...actual,
    createSnapDrag: (element: HTMLElement, options: SnapDragOptions) => {
      const snap = actual.createSnapDrag(element, options);
      const settleTo = vi.fn(snap.settleTo);
      const setSnapPoints = vi.fn(snap.setSnapPoints);
      const spied = {...snap, settleTo, setSnapPoints};
      created.push({options, snap: spied});
      return spied;
    },
  };
});

/** A row 300 px wide whose trailing side has two 72 px entries. */
function renderRow() {
  render(
    <Item
      label="Conversation"
      data-testid="row"
      swipeActions={{
        trailing: [
          {label: 'Archive', onActivate: vi.fn()},
          {label: 'Delete', onActivate: vi.fn(), hasRemoval: true},
        ],
      }}
    />,
  );
  const row = screen.getByTestId('row');
  Object.defineProperty(row, 'clientWidth', {value: 300, configurable: true});
  for (const entry of row.querySelectorAll<HTMLElement>(
    '[data-swipe-panel="trailing"] > div > *',
  )) {
    Object.defineProperty(entry, 'offsetWidth', {
      value: 72,
      configurable: true,
    });
  }
  const last = created.at(-1);
  if (last == null) {
    throw new Error('the row created no shared drag');
  }
  return {row, ...last};
}

// The swipe layer is loaded lazily: load it once, so each row below renders
// its layer, and creates its drag, at its first render.
beforeAll(async () => {
  render(
    <Item
      label="Warm"
      data-testid="warm"
      swipeActions={{leading: [{label: 'Unread', onActivate: () => {}}]}}
    />,
  );
  // The layer's chunk carries the gesture core: its first load in a cold
  // worker can take longer than waitFor's default second.
  await waitFor(
    () => {
      expect(
        screen.getByTestId('warm').querySelector('[data-swipe-panel]'),
      ).not.toBeNull();
    },
    {timeout: 10_000},
  );
  cleanup();
  created.length = 0;
});

describe('the row on the shared drag path', () => {
  afterEach(() => {
    created.length = 0;
  });

  it('runs the shared snap-point drag, drawn into the row’s travel property, under a finger, a pen and a trackpad but never a mouse', () => {
    const {options} = renderRow();
    expect(options.axis).toBe('x');
    expect(options.customProperty).toMatchObject({
      name: '--_item-swipe-travel',
      syntax: '<length>',
      // The full swipe's confirm, drawn from the travel in the same animation.
      companion: {name: '--_item-swipe-confirm', syntax: '<number>'},
    });
    expect(options.pan?.allowedPointerTypes).toEqual(['touch', 'pen']);
    expect(options.pan?.allowedScrollTypes).toEqual(['continuous']);
    expect(options.flickThreshold).toBeUndefined();
  });

  it('declares a side’s stops: rest, the open width, and out past the row’s edge', () => {
    const {options, snap} = renderRow();
    // A drag toward the inline start (LTR): the trailing side, on the left.
    expect(
      options.model?.begin?.({
        start: 0,
        translation: 0,
        total: -10,
        input: 'scroll',
      }),
    ).toBe(true);
    expect(snap.setSnapPoints).toHaveBeenLastCalledWith([
      -(300 + SWIPE.slideOutOvershoot),
      -144,
      0,
    ]);
  });

  it('follows a trackpad’s fingers one for one and settles its release on the shared settle spring from their speed (spec:AST-094 FR43)', () => {
    const {options, snap} = renderRow();
    const model = options.model;
    model?.begin?.({start: 0, translation: 0, total: -10, input: 'scroll'});
    // One for one: no spring of the row's own.
    const target = model?.move?.({
      start: 0,
      translation: -100,
      total: -108,
      input: 'scroll',
    });
    expect(target).toEqual({offset: -100});
    // Released at 400 px/s toward the side, past half the open width: open,
    // on the shared settle spring (none named), from the fingers' speed.
    let landing: unknown;
    act(() => {
      landing = model?.release?.({
        start: 0,
        translation: -100,
        total: -108,
        input: 'scroll',
        velocity: -400,
      });
    });
    expect(landing).toBeNull();
    expect(snap.settleTo).toHaveBeenLastCalledWith(1, {
      spring: undefined,
      touchRelease: false,
      velocity: -400,
    });
  });

  it('keeps a finger’s drag on UIKit’s model: the dead zone, then the tracking spring (spec:AST-057)', () => {
    const {options} = renderRow();
    const model = options.model;
    model?.begin?.({start: 0, translation: 0, total: -10, input: 'touch'});
    // Inside UIKit's 25 px dead zone the row stays where it is.
    expect(
      model?.move?.({start: 0, translation: -12, total: -20, input: 'touch'}),
    ).toBeNull();
    // Past it, the swipe counts from 0 there, on the tracking spring.
    expect(
      model?.move?.({start: 0, translation: -52, total: -60, input: 'touch'}),
    ).toEqual({offset: -35, spring: SWIPE.tracking});
  });
});
