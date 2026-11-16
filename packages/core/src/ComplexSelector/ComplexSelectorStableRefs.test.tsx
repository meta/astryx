// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ComplexSelectorStableRefs.test.tsx
 * @input Uses vitest, Testing Library and ComplexSelector, with usePopover
 *   wrapped so each call React makes to the popover's trigger ref is recorded
 * @output Unit tests: a re-render with unchanged props leaves the built-in
 *   trigger and a caller's trigger attached
 * @position Tests; validates that ComplexSelector hands its trigger elements
 *   refs that keep their identity across renders
 *
 * SYNC: When ComplexSelector.tsx changes how it attaches its trigger, update
 * these tests.
 */

import React from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import type * as PopoverModule from '../Popover/usePopover';
import {ComplexSelector} from './ComplexSelector';

// Each call React makes to the popover's trigger ref, in order.
const triggerRefCalls = vi.hoisted(() => [] as (HTMLElement | null)[]);

vi.mock('../Popover/usePopover', async importOriginal => {
  const actual = await importOriginal<typeof PopoverModule>();
  const {useCallback, useMemo} = await import('react');
  // The wrapper keeps the real ref's identity, so it records only the calls
  // React makes to the ref ComplexSelector hands its trigger.
  function useRecordingPopover(
    ...args: Parameters<typeof actual.usePopover>
  ): ReturnType<typeof actual.usePopover> {
    const popover = actual.usePopover(...args);
    const realTriggerRef = popover.triggerRef;
    const triggerRef = useCallback(
      (el: HTMLElement | null) => {
        triggerRefCalls.push(el);
        realTriggerRef(el);
      },
      [realTriggerRef],
    );
    return useMemo(() => ({...popover, triggerRef}), [popover, triggerRef]);
  }
  return {...actual, usePopover: useRecordingPopover};
});

const originalMatches = HTMLElement.prototype.matches;

// Mock the Popover API, which jsdom does not implement.
beforeEach(() => {
  triggerRefCalls.length = 0;
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });
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
function renderFruitSelector() {
  return (
    <ComplexSelector label="Fruit" value="Apple" triggerLabel="Apple">
      {() => <button type="button">Apply</button>}
    </ComplexSelector>
  );
}

describe('ComplexSelector trigger refs', () => {
  it('keeps the built-in trigger attached through a re-render with unchanged props', () => {
    const {rerender} = render(renderFruitSelector());
    expect(triggerRefCalls.at(-1)).toBeInstanceOf(HTMLElement);
    triggerRefCalls.length = 0;

    rerender(renderFruitSelector());

    expect(triggerRefCalls).toEqual([]);
  });

  it('keeps the built-in trigger attached through a re-render while the popup is open', () => {
    const {rerender} = render(renderFruitSelector());
    const trigger = screen.getByRole('combobox', {name: 'Fruit'});
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    triggerRefCalls.length = 0;

    rerender(renderFruitSelector());

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(triggerRefCalls).toEqual([]);
  });

  it('keeps a caller trigger and the caller ref attached through a re-render with unchanged props', () => {
    const callerRef = vi.fn();
    let lastTriggerRef: unknown = null;
    const renderWithCallerTrigger = () => (
      <ComplexSelector
        label="View options"
        value={[]}
        ref={callerRef}
        renderTrigger={props => {
          lastTriggerRef = props.ref;
          return (
            <button type="button" {...props}>
              Options
            </button>
          );
        }}>
        {() => <button type="button">Apply</button>}
      </ComplexSelector>
    );
    const {rerender} = render(renderWithCallerTrigger());
    const opener = screen.getByRole('combobox', {name: 'View options'});
    expect(callerRef).toHaveBeenLastCalledWith(opener);
    const triggerRefBefore = lastTriggerRef;
    callerRef.mockClear();
    triggerRefCalls.length = 0;

    rerender(renderWithCallerTrigger());

    expect(callerRef).not.toHaveBeenCalled();
    expect(triggerRefCalls).toEqual([]);
    expect(lastTriggerRef).toBe(triggerRefBefore);
  });
});
