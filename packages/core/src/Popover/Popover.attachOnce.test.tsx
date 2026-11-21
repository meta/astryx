// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Popover.attachOnce.test.tsx
 * @input Uses vitest, Testing Library, Popover
 * @output Tests that a re-render with unchanged inputs does not attach the
 *   trigger again
 * @position Testing; guards Popover.tsx against a trigger attach that runs,
 *   and sets state, after every render
 *
 * SYNC: When Popover.tsx changes, update tests to match
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, cleanup} from '@testing-library/react';
import {act, useState} from 'react';
import {Popover} from './Popover';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Popover children mode', () => {
  it('attaches its trigger once across re-renders that change nothing it reads', () => {
    const addListener = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    let rerenderParent: () => void = () => {};
    function Parent() {
      const [, setCount] = useState(0);
      rerenderParent = () => setCount(count => count + 1);
      return (
        <Popover content={<span>Shortcuts</span>} label="Shortcuts">
          <button type="button">Open</button>
        </Popover>
      );
    }
    render(<Parent />);
    const clicks = () =>
      addListener.mock.calls.filter(
        ([type], index) =>
          type === 'click' &&
          addListener.mock.contexts[index] instanceof HTMLButtonElement,
      ).length;
    const attachedAtMount = clicks();
    expect(attachedAtMount).toBeGreaterThan(0);

    for (let i = 0; i < 5; i++) {
      act(() => rerenderParent());
    }

    expect(clicks()).toBe(attachedAtMount);
  });
});
