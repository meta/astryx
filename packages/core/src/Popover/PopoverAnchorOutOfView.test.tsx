// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverAnchorOutOfView.test.tsx
 * @input Popover with `anchorOutOfView`, and a stubbed IntersectionObserver
 * @output Tests for hold and hide while the anchor is out of view
 *   (spec:AST-116 FR7, FR8)
 * @position Colocated with Popover.tsx and usePopover.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import React, {useRef, useState} from 'react';
import {Popover} from './Popover';

let notify: IntersectionObserverCallback | null = null;
let observed: Element[] = [];

class StubObserver {
  constructor(callback: IntersectionObserverCallback) {
    notify = callback;
  }
  observe(target: Element) {
    observed.push(target);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function report(isIntersecting: boolean) {
  act(() => {
    notify?.(
      [{isIntersecting} as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
}

beforeEach(() => {
  notify = null;
  observed = [];
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Harness({
  anchorOutOfView,
  onOpenChange,
}: {
  anchorOutOfView?: 'hold' | 'hide';
  onOpenChange?: (isOpen: boolean) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={rowRef} data-testid="row">
        Row
      </div>
      <Popover
        anchor={rowRef}
        anchorOutOfView={anchorOutOfView}
        isOpen
        onOpenChange={onOpenChange}
        hasLightDismiss={false}
        hasAutoFocus={false}
        label="Row editor"
        content={<span>Editor</span>}
      />
    </>
  );
}

function layerOf(text: string): HTMLElement {
  const layer = screen.getByText(text).closest<HTMLElement>('[popover]');
  if (layer == null) {
    throw new Error('No layer');
  }
  return layer;
}

describe('Popover anchorOutOfView', () => {
  it('hides, without closing, while the anchor is out of view', () => {
    const onOpenChange = vi.fn();
    render(<Harness anchorOutOfView="hide" onOpenChange={onOpenChange} />);
    const layer = layerOf('Editor');
    expect(observed).toContain(screen.getByTestId('row'));
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');

    report(false);
    expect(getComputedStyle(layer).visibility).toBe('hidden');
    expect(getComputedStyle(layer).pointerEvents).toBe('none');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog', {hidden: true})).toBeInTheDocument();

    report(true);
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');
  });

  it('holds by default', () => {
    render(<Harness />);
    const layer = layerOf('Editor');
    report(false);
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');
  });

  it('observes an anchor that replaces the first while open', () => {
    function Switching() {
      const [row, setRow] = useState('a');
      return (
        <>
          <div data-row="a">A</div>
          <div data-row="b">B</div>
          <button type="button" onClick={() => setRow('b')}>
            Next
          </button>
          <Popover
            anchor={() => document.querySelector(`[data-row="${row}"]`)}
            anchorOutOfView="hide"
            isOpen
            hasLightDismiss={false}
            hasAutoFocus={false}
            label="Row editor"
            content={<span>Switching editor</span>}
          />
        </>
      );
    }
    render(<Switching />);
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    expect(observed.at(-1)).toBe(document.querySelector('[data-row="b"]'));
  });
});
