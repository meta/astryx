// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverAnchor.test.tsx
 * @input usePopover with a separate `anchor`
 * @output Tests for an anchor apart from the trigger
 * @position Colocated with usePopover.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import React, {useEffect, useRef, useState, type ReactNode} from 'react';
import {usePopover} from './usePopover';
import type {PopoverAnchor} from './popoverAnchor';

function query(selector: string): Element {
  const element = document.querySelector(selector);
  if (element == null) {
    throw new Error(`No element matches ${selector}`);
  }
  return element;
}

function anchorNameOf(element: Element): string {
  return (element as HTMLElement).style.getPropertyValue('anchor-name');
}

interface TriggerlessProps {
  anchor: PopoverAnchor;
  label: string;
  content: ReactNode;
  onHide?: () => void;
}

/** A popover with an anchor and no trigger, opened from code on mount. */
function Triggerless({anchor, label, content, onHide}: TriggerlessProps) {
  const popover = usePopover({
    anchor,
    dialogLabel: label,
    hasLightDismiss: false,
    hasAutoFocus: false,
    onHide,
  });
  const {show} = popover;
  useEffect(() => {
    show();
  }, [show]);
  return <>{popover.render(content)}</>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePopover anchor', () => {
  it('anchors to a non-button element while the trigger keeps its role', () => {
    function Test() {
      const cellRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({anchor: cellRef, dialogLabel: 'Edit'});
      return (
        <>
          <div ref={cellRef} data-testid="cell">
            Revenue
          </div>
          <button
            type="button"
            ref={popover.triggerRef}
            onClick={popover.toggle}
            {...popover.triggerProps}>
            Edit
          </button>
          {popover.render(<span>Editor</span>)}
        </>
      );
    }
    render(<Test />);
    const trigger = screen.getByRole('button', {name: 'Edit'});
    const cell = screen.getByTestId('cell');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // The anchor carries the layer's anchor name and nothing else.
    expect(anchorNameOf(cell)).toMatch(/^--astryx-layer-/);
    expect(cell).not.toHaveAttribute('aria-haspopup');
    expect(cell).not.toHaveAttribute('aria-expanded');
    expect(cell).not.toHaveAttribute('aria-controls');
    expect(anchorNameOf(trigger)).toBe('');
  });

  it('anchors to the trigger again when the anchor is dropped', () => {
    function Test({hasAnchor}: {hasAnchor: boolean}) {
      const regionRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({
        anchor: hasAnchor ? regionRef : undefined,
        dialogLabel: 'Help',
      });
      return (
        <>
          <div ref={regionRef} data-testid="region" />
          <button
            type="button"
            ref={popover.triggerRef}
            onClick={() => popover.show()}>
            Help
          </button>
          {popover.render(<span>Help text</span>)}
        </>
      );
    }
    const {rerender} = render(<Test hasAnchor />);
    const trigger = screen.getByRole('button', {name: 'Help'});
    fireEvent.click(trigger);
    expect(anchorNameOf(screen.getByTestId('region'))).toMatch(
      /^--astryx-layer-/,
    );

    rerender(<Test hasAnchor={false} />);
    expect(anchorNameOf(trigger)).toMatch(/^--astryx-layer-/);
    expect(anchorNameOf(screen.getByTestId('region'))).toBe('');
  });

  it('opens with no trigger from code and reports a dismissal', () => {
    const onHide = vi.fn();
    function Test() {
      const chartRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={chartRef} data-testid="chart" />
          <Triggerless
            anchor={chartRef}
            label="Chart note"
            onHide={onHide}
            content={<button type="button">Got it</button>}
          />
        </>
      );
    }
    render(<Test />);
    // jsdom matches no `:popover-open`, so an open layer reads as hidden.
    expect(
      screen.getByRole('dialog', {name: 'Chart note', hidden: true}),
    ).toBeInTheDocument();
    expect(anchorNameOf(screen.getByTestId('chart'))).toMatch(
      /^--astryx-layer-/,
    );
    // No element received trigger semantics.
    expect(document.querySelector('[aria-haspopup]')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', {name: 'Close popover', hidden: true}),
    );
    expect(onHide).toHaveBeenCalled();
  });

  it('does not warn that a non-button anchor is not a button', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Test() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={ref} />
          <Triggerless anchor={ref} label="Note" content={<span>Body</span>} />
        </>
      );
    }
    render(<Test />);
    expect(
      warn.mock.calls.some(([message]) => String(message).includes('<button>')),
    ).toBe(false);
  });

  it('moves to the element a new function returns without remounting', () => {
    const onHide = vi.fn();
    function Test() {
      const [row, setRow] = useState('a');
      return (
        <>
          <div data-row="a">Row A</div>
          <div data-row="b">Row B</div>
          <button type="button" onClick={() => setRow('b')}>
            Next row
          </button>
          <Triggerless
            anchor={() => document.querySelector(`[data-row="${row}"]`)}
            label="Row editor"
            onHide={onHide}
            content={<input aria-label="Value" />}
          />
        </>
      );
    }
    render(<Test />);
    const rowA = query('[data-row="a"]');
    const rowB = query('[data-row="b"]');
    const input = screen.getByRole('textbox', {name: 'Value', hidden: true});
    expect(anchorNameOf(rowA)).toMatch(/^--astryx-layer-/);

    fireEvent.click(screen.getByRole('button', {name: 'Next row'}));

    expect(anchorNameOf(rowA)).toBe('');
    expect(anchorNameOf(rowB)).toMatch(/^--astryx-layer-/);
    // Same surface, still open.
    expect(screen.getByRole('textbox', {name: 'Value', hidden: true})).toBe(
      input,
    );
    expect(onHide).not.toHaveBeenCalled();
  });

  it('does not watch the page: a replaced element is read on the next new function', async () => {
    const findPencil = () => document.querySelector('[data-pencil]');
    function Test({anchor}: {anchor: PopoverAnchor}) {
      return (
        <>
          <div data-testid="host">
            <span data-pencil="">Pencil</span>
          </div>
          <Triggerless
            anchor={anchor}
            label="Editor"
            content={<span>Editor</span>}
          />
        </>
      );
    }
    const {rerender} = render(<Test anchor={findPencil} />);
    const host = screen.getByTestId('host');
    const first = query('[data-pencil]');
    expect(anchorNameOf(first)).toMatch(/^--astryx-layer-/);

    const replacement = document.createElement('span');
    replacement.setAttribute('data-pencil', '');
    await act(async () => {
      first.remove();
      host.append(replacement);
      await Promise.resolve();
    });
    // The same function is not read again, and nothing observes the page.
    rerender(<Test anchor={findPencil} />);
    expect(anchorNameOf(replacement)).toBe('');

    // The caller's refresh: a different function is read.
    rerender(<Test anchor={() => findPencil()} />);
    expect(anchorNameOf(replacement)).toMatch(/^--astryx-layer-/);
  });

  it('shows no surface while the anchor resolves to nothing', () => {
    function Test() {
      const [isMounted, setIsMounted] = useState(false);
      return (
        <>
          {isMounted && <div data-late="">Late target</div>}
          <button type="button" onClick={() => setIsMounted(true)}>
            Load
          </button>
          <Triggerless
            anchor={() => document.querySelector('[data-late]')}
            label="Late"
            content={<span>Late content</span>}
          />
        </>
      );
    }
    render(<Test />);
    const layer = screen.getByText('Late content').closest('[popover]');
    if (layer == null) {
      throw new Error('No layer');
    }
    expect(getComputedStyle(layer).visibility).toBe('hidden');

    fireEvent.click(screen.getByRole('button', {name: 'Load'}));
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');
    expect(anchorNameOf(query('[data-late]'))).toMatch(/^--astryx-layer-/);
  });
});
