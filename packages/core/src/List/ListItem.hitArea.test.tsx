// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListItem.hitArea.test.tsx
 * @input Vitest, Testing Library, and utils/hitArea.ts with `watchHitArea`
 *   spied (the rest real)
 * @output Checks that ListItem keeps an interactive, enabled row's touch hit
 *   insets live through the shared utility (`component:List` FR10): which
 *   rows it watches, that the insets land on the row, the theme's touch
 *   target size under a finger, that a measurement taken mid-motion waits for
 *   the motion to end, and that it stops when the row goes
 * @position Test for ListItem's hit area wiring (ListItem.tsx, through
 *   utils/touchHitArea.ts); the layer's own CSS is checked in List.test.tsx, its
 *   hit testing in __tests__/ListTouchHitArea.interaction.browser.spec.ts
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

describe('ListItem touch hit area (component:List FR10)', () => {
  afterEach(() => {
    watches.length = 0;
    vi.unstubAllGlobals();
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

  it('grows toward the theme’s touch target under a finger, and 44px otherwise', () => {
    const {unmount} = render(
      <List>
        <ListItem
          label="Themed"
          onClick={() => {}}
          style={{['--size-touch-target' as string]: '48px'}}
        />
      </List>,
    );
    // No coarse pointer: the 44px minimum, whatever the theme says.
    expect(watches.map(watch => watch.minSize)).toEqual([44]);
    unmount();
    watches.length = 0;
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      matches: media === '(pointer: coarse)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(
      <List>
        <ListItem
          label="Themed"
          onClick={() => {}}
          style={{['--size-touch-target' as string]: '48px'}}
        />
        <ListItem label="Default" onClick={() => {}} />
      </List>,
    );
    expect(watches.map(watch => watch.minSize)).toEqual([48, 44]);
  });

  it('drops a measurement taken while the list moves, and watches the row afresh once the motion ends', async () => {
    render(
      <List>
        <ListItem label="Pressable" onClick={() => {}} />
      </List>,
    );
    const row = screen.getByText('Pressable').closest('li')!;
    const list = row.parentElement!;
    let finish = (): void => {};
    const finished = new Promise<void>(resolve => {
      finish = resolve;
    });
    const motion = {
      playState: 'running',
      effect: {getComputedTiming: () => ({endTime: 300})},
      finished,
    } as unknown as Animation;
    list.getAnimations = () => [motion];
    expect(watches).toHaveLength(1);
    watches[0].onInsets({top: 3, right: 0, bottom: 1, left: 0});
    // Mid-motion: nothing written.
    expect(row.style.getPropertyValue('--astryx-hit-inset-top')).toBe('');
    list.getAnimations = () => [];
    finish();
    await vi.waitFor(() => expect(watches).toHaveLength(2));
    // The old watch stopped, and the fresh one measures the row at rest.
    expect(watches[0].stop).toHaveBeenCalledTimes(1);
    watches[1].onInsets({top: 4, right: 0, bottom: 1, left: 0});
    expect(row.style.getPropertyValue('--astryx-hit-inset-top')).toBe('4px');
  });

  it('stops watching when the row goes or turns disabled', () => {
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
    expect(watches[0].stop).toHaveBeenCalledTimes(1);
    expect(watches).toHaveLength(1);
    rerender(
      <List>
        <ListItem label="Pressable" onClick={() => {}} />
      </List>,
    );
    expect(watches).toHaveLength(2);
    unmount();
    expect(watches[1].stop).toHaveBeenCalledTimes(1);
  });
});
