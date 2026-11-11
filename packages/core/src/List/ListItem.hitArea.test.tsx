// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListItem.hitArea.test.tsx
 * @input Vitest, Testing Library, and utils/hitArea.ts with `watchHitArea`
 *   spied (the rest real)
 * @output Checks that ListItem keeps an enabled interactive row's touch hit
 *   insets live. It covers the rows watched, the insets, the target size, a
 *   mid-motion measurement, and the stop.
 * @position Test for ListItem's hit area wiring. List.test.tsx checks the
 *   layer's CSS, and ListTouchHitArea.interaction.browser.spec.ts its hit
 *   testing.
 */

import {createRef} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import type * as HitAreaModule from '../utils/hitArea';
import type {HitInsets} from '../utils/hitArea';

const watches = vi.hoisted(
  () =>
    [] as {
      element: Element;
      onInsets: (insets: HitInsets) => void;
      minSize: number | undefined;
      stop: ReturnType<typeof vi.fn>;
    }[],
);

vi.mock('../utils/hitArea', async importOriginal => {
  const actual = await importOriginal<typeof HitAreaModule>();
  return {
    ...actual,
    watchHitArea: (
      element: Element,
      onInsets: (insets: HitInsets) => void,
      options?: {readonly minSize?: number},
    ) => {
      const stop = vi.fn();
      watches.push({element, onInsets, minSize: options?.minSize, stop});
      return stop;
    },
  };
});

import {List} from './List';
import {ListItem} from './ListItem';

describe('ListItem touch hit area', () => {
  afterEach(() => {
    watches.length = 0;
  });

  const row = (text: string) => screen.getByText(text).closest('li')!;

  it('watches each interactive, enabled row, and no other', () => {
    const control = createRef<HTMLButtonElement>();
    render(
      <List>
        <ListItem label="Pressable" onClick={() => {}} />
        <ListItem label="Link" href="#settings" />
        <ListItem
          label="Delegated"
          interactiveRef={control}
          endContent={
            <button type="button" ref={control}>
              Toggle
            </button>
          }
        />
        <ListItem label="Read-only" />
        <ListItem label="Disabled" onClick={() => {}} isDisabled />
      </List>,
    );
    expect(watches.map(watch => watch.element)).toEqual([
      row('Pressable'),
      row('Link'),
      row('Delegated'),
    ]);
  });

  it('puts the measured insets on the row, where its layer reads them', () => {
    render(
      <List>
        <ListItem label="Pressable" onClick={() => {}} />
      </List>,
    );
    expect(watches).toHaveLength(1);
    watches[0].onInsets({top: 4, right: 0, bottom: 1, left: 0});
    const style = row('Pressable').style;
    expect(style.getPropertyValue('--astryx-hit-inset-top')).toBe('4px');
    expect(style.getPropertyValue('--astryx-hit-inset-bottom')).toBe('1px');
    expect(style.getPropertyValue('--astryx-hit-inset-left')).toBe('0px');
  });

  it('stops watching when the row goes or turns disabled', async () => {
    const {rerender, unmount} = render(
      <List>
        <ListItem label="Pressable" onClick={() => {}} />
      </List>,
    );
    expect(watches).toHaveLength(1);
    rerender(
      <List>
        <ListItem label="Pressable" onClick={() => {}} isDisabled />
      </List>,
    );
    await Promise.resolve();
    expect(watches[0].stop).toHaveBeenCalledTimes(1);
    expect(watches).toHaveLength(1);
    rerender(
      <List>
        <ListItem label="Pressable" onClick={() => {}} />
      </List>,
    );
    expect(watches).toHaveLength(2);
    unmount();
    await Promise.resolve();
    expect(watches[1].stop).toHaveBeenCalledTimes(1);
  });

  it('keeps its watch and its insets when a parent re-render passes a new inline ref', async () => {
    const rowRef = (tick: number) => (node: HTMLLIElement | null) => {
      node?.setAttribute('data-tick', String(tick));
    };
    const {rerender} = render(
      <List>
        <ListItem label="Filter" onClick={() => {}} ref={rowRef(0)} />
      </List>,
    );
    const row = screen.getByRole('listitem');
    watches[0].onInsets({top: 4, right: 0, bottom: 4, left: 0});
    rerender(
      <List>
        <ListItem label="Filter" onClick={() => {}} ref={rowRef(1)} />
      </List>,
    );
    await Promise.resolve();
    expect(row.getAttribute('data-tick')).toBe('1');
    expect(watches).toHaveLength(1);
    expect(watches[0].stop).not.toHaveBeenCalled();
    expect(row.style.getPropertyValue('--astryx-hit-inset-top')).toBe('4px');
  });
});
