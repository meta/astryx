// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuStableRefs.test.tsx
 * @input Uses vitest, Testing Library and DropdownMenu, with the list focus
 *   hook's list ref instrumented so each write to it is recorded
 * @output Unit tests: a re-render with unchanged props leaves the menu list
 *   attached, closed and open
 * @position Tests; validates that DropdownMenu hands its menu list a ref that
 *   keeps its identity across renders
 *
 * SYNC: When DropdownMenu.tsx changes how it attaches its menu list, update
 * these tests.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import type * as ListFocusModule from '../hooks/useListFocus';
import {DropdownMenu} from './DropdownMenu';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

// Each value written to a list focus hook's list ref, in order.
const listRefWrites = vi.hoisted(() => [] as (HTMLElement | null)[]);

vi.mock('../hooks/useListFocus', async importOriginal => {
  const actual = await importOriginal<typeof ListFocusModule>();
  const {useState} = await import('react');
  // Records each write to the hook's own ref object, without changing what
  // the ref holds.
  function recordWrites(ref: {current: HTMLElement | null}) {
    let current = ref.current;
    Object.defineProperty(ref, 'current', {
      configurable: true,
      get: () => current,
      set: (next: HTMLElement | null) => {
        listRefWrites.push(next);
        current = next;
      },
    });
    return true;
  }
  function useRecordingListFocus<T extends HTMLElement>(
    ...args: Parameters<typeof actual.useInternalListFocus<T>>
  ): ReturnType<typeof actual.useInternalListFocus<T>> {
    const result = actual.useInternalListFocus<T>(...args);
    // The initializer runs once, before the first commit attaches the list.
    useState(() =>
      recordWrites(result.listRef as {current: HTMLElement | null}),
    );
    return result;
  }
  return {...actual, useInternalListFocus: useRecordingListFocus};
});

// Mock showPopover and hidePopover, which jsdom does not implement.
beforeEach(() => {
  listRefWrites.length = 0;
  __resetInteractionModalityForTest();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
  const originalMatches = HTMLElement.prototype.matches;
  Object.defineProperty(HTMLElement.prototype, 'matches', {
    configurable: true,
    value: function (this: HTMLElement, selector: string): boolean {
      if (selector === ':popover-open') {
        return this.hasAttribute('popover-open');
      }
      return originalMatches.call(this, selector);
    },
  });
});

// A fresh element on each call, so a re-render passes new but equal props.
function renderActionsMenu() {
  return (
    <DropdownMenu button={{label: 'Actions'}} items={[{label: 'Item 1'}]} />
  );
}

describe('DropdownMenu list ref', () => {
  it('keeps the menu list attached through a re-render with unchanged props', () => {
    const {rerender} = render(renderActionsMenu());
    expect(listRefWrites.at(-1)).toBe(screen.getByRole('menu', {hidden: true}));
    listRefWrites.length = 0;

    rerender(renderActionsMenu());

    expect(listRefWrites).toEqual([]);
  });

  it('keeps the menu list attached through a re-render while the menu is open', () => {
    const {rerender} = render(renderActionsMenu());
    const trigger = screen.getByRole('button', {name: /Actions/});
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    listRefWrites.length = 0;

    rerender(renderActionsMenu());

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(listRefWrites).toEqual([]);
  });
});
