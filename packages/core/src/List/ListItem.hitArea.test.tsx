// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListItem.hitArea.test.tsx
 * @input Vitest, Testing Library, stubbed row rects and a stubbed
 *   `document.elementsFromPoint`
 * @output Checks that ListItem gives each enabled interactive row the touch
 *   band, with the List's room between rows, and that a tap on a row's band
 *   that lies on the next row goes to the next row, also after a re-render
 *   passes a new inline ref.
 * @position Test for ListItem's hit area wiring. List.test.tsx checks the
 *   band's CSS, and ListTouchHitArea.interaction.browser.spec.ts its hit
 *   testing.
 */

import {createRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {List} from './List';
import {ListItem} from './ListItem';

const bandClasses = [touchHitAreaStyles.band, touchHitAreaStyles.member]
  .flatMap(style => (stylex.props(style).className ?? '').split(/\s+/))
  .filter(name => name !== '' && !name.startsWith('touchHitArea__'));

function hasBand(element: Element): boolean {
  return bandClasses.every(name => element.classList.contains(name));
}

function rect(top: number) {
  const box = {left: 0, top, right: 300, bottom: top + 32};
  return {...box, x: 0, y: top, width: 300, height: 32, toJSON: () => box};
}

describe('ListItem touch hit area', () => {
  afterEach(() => {
    delete (document as {elementsFromPoint?: unknown}).elementsFromPoint;
  });

  const row = (text: string) => screen.getByText(text).closest('li')!;

  it('gives each interactive, enabled row the band, and no other', () => {
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
    const banded = screen.getAllByRole('listitem').filter(hasBand);
    expect(banded).toEqual([row('Pressable'), row('Link'), row('Delegated')]);
  });

  it('gives a tap on a row’s band that lies on the next row to the next row, after a re-render too', () => {
    const onFirst = vi.fn();
    const onSecond = vi.fn();
    const rowRef = (tick: number) => (node: HTMLLIElement | null) => {
      node?.setAttribute('data-tick', String(tick));
    };
    const rows = (tick: number) => (
      <List>
        <ListItem label="First" onClick={onFirst} ref={rowRef(tick)} />
        <ListItem label="Second" onClick={onSecond} />
      </List>
    );
    const {rerender} = render(rows(0));
    rerender(rows(1));
    const first = row('First');
    const second = row('Second');
    expect(first.getAttribute('data-tick')).toBe('1');
    // The second row's own target covers the row.
    const secondTarget = second.querySelector('button') as HTMLElement;
    first.getBoundingClientRect = () => rect(0);
    second.getBoundingClientRect = () => rect(34);
    secondTarget.getBoundingClientRect = () => rect(34);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [first, secondTarget, second, first.parentElement],
    });
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 100, clientY: 36});
    first.dispatchEvent(press);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    first.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(onFirst).not.toHaveBeenCalled();
    expect(onSecond).toHaveBeenCalledTimes(1);
  });
});
