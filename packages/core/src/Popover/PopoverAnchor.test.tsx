// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverAnchor.test.tsx
 * @input Popover and usePopover with a separate `anchor`
 * @output Tests for an anchor apart from the trigger (spec:AST-116 FR1–FR3,
 *   FR5, FR6, FR19)
 * @position Colocated with Popover.tsx and usePopover.tsx
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import React, {useRef, useState} from 'react';
import {Popover} from './Popover';
import {usePopover} from './usePopover';

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Popover anchor', () => {
  it('anchors to a non-button element while the trigger keeps its role', () => {
    function Test() {
      const cellRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={cellRef} data-testid="cell">
            Revenue
          </div>
          <Popover anchor={cellRef} label="Edit" content={<span>Editor</span>}>
            <button type="button">Edit</button>
          </Popover>
        </>
      );
    }
    render(<Test />);
    const trigger = screen.getByRole('button', {name: 'Edit'});
    const cell = screen.getByTestId('cell');

    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // The anchor carries the layer's anchor name and nothing else.
    expect(anchorNameOf(cell)).toMatch(/^--astryx-layer-/);
    expect(cell).not.toHaveAttribute('aria-haspopup');
    expect(cell).not.toHaveAttribute('aria-expanded');
    expect(cell).not.toHaveAttribute('aria-controls');
    // The trigger's wrapper is not the anchor.
    expect(anchorNameOf(trigger.parentElement ?? trigger)).toBe('');
  });

  it('keeps anchorRef as the trigger when both are given', () => {
    function Test() {
      const buttonRef = useRef<HTMLButtonElement>(null);
      const cardRef = useRef<HTMLElement>(null);
      return (
        <>
          <section ref={cardRef} data-testid="card">
            Card
          </section>
          <button type="button" ref={buttonRef}>
            Details
          </button>
          <Popover
            anchorRef={buttonRef as React.RefObject<HTMLElement>}
            anchor={cardRef}
            label="Details"
            content={<span>Body</span>}
          />
        </>
      );
    }
    render(<Test />);
    const button = screen.getByRole('button', {name: 'Details'});
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(anchorNameOf(button)).toBe('');
    expect(anchorNameOf(screen.getByTestId('card'))).toMatch(
      /^--astryx-layer-/,
    );
  });

  it('opens with no trigger through isOpen and reports a dismissal', () => {
    const onOpenChange = vi.fn();
    function Test() {
      const chartRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={chartRef} data-testid="chart" />
          <Popover
            anchor={chartRef}
            isOpen
            onOpenChange={onOpenChange}
            label="Chart note"
            hasLightDismiss={false}
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
    // Controlled: the dismissal is reported; `isOpen` stays the caller's.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('warns when a trigger-less popover is not controlled', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Test() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={ref} />
          <Popover anchor={ref} label="Note" content={<span>Body</span>} />
        </>
      );
    }
    render(<Test />);
    expect(
      warn.mock.calls.some(([message]) =>
        String(message).includes('opens only through `isOpen`'),
      ),
    ).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not warn that a non-button anchor is not a button', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    function Test() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={ref} />
          <Popover
            anchor={ref}
            isOpen
            label="Note"
            content={<span>Body</span>}
          />
        </>
      );
    }
    render(<Test />);
    expect(
      warn.mock.calls.some(([message]) => String(message).includes('<button>')),
    ).toBe(false);
  });

  it('moves to the element a function anchor returns without remounting', () => {
    const onOpenChange = vi.fn();
    function Test() {
      const [row, setRow] = useState('a');
      return (
        <>
          <div data-row="a">Row A</div>
          <div data-row="b">Row B</div>
          <button type="button" onClick={() => setRow('b')}>
            Next row
          </button>
          <Popover
            anchor={() => document.querySelector(`[data-row="${row}"]`)}
            isOpen
            onOpenChange={onOpenChange}
            hasLightDismiss={false}
            hasAutoFocus={false}
            label="Row editor"
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
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('follows a function anchor whose element is replaced outside React', async () => {
    function Test() {
      return (
        <>
          <div data-testid="host">
            <span data-pencil="">Pencil</span>
          </div>
          <Popover
            anchor={() => document.querySelector('[data-pencil]')}
            isOpen
            hasLightDismiss={false}
            hasAutoFocus={false}
            label="Editor"
            content={<span>Editor</span>}
          />
        </>
      );
    }
    render(<Test />);
    const host = screen.getByTestId('host');
    const first = query('[data-pencil]');
    expect(anchorNameOf(first)).toMatch(/^--astryx-layer-/);

    const replacement = document.createElement('span');
    replacement.setAttribute('data-pencil', '');
    await act(async () => {
      first.remove();
      host.append(replacement);
      // MutationObserver delivers on a microtask.
      await Promise.resolve();
    });
    expect(anchorNameOf(replacement)).toMatch(/^--astryx-layer-/);
  });

  it('shows no surface while the anchor resolves to nothing', async () => {
    function Test() {
      const [isMounted, setIsMounted] = useState(false);
      return (
        <>
          {isMounted && <div data-late="">Late target</div>}
          <button type="button" onClick={() => setIsMounted(true)}>
            Load
          </button>
          <Popover
            anchor={() => document.querySelector('[data-late]')}
            isOpen
            hasLightDismiss={false}
            hasAutoFocus={false}
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

describe('usePopover anchor', () => {
  it('binds the anchor, not the trigger, as the layer anchor', () => {
    function Test() {
      const regionRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({anchor: regionRef, dialogLabel: 'Help'});
      return (
        <>
          <div ref={regionRef} data-testid="region" />
          <button
            type="button"
            ref={popover.triggerRef}
            onClick={popover.toggle}
            {...popover.triggerProps}>
            Help
          </button>
          {popover.render(<span>Help text</span>)}
        </>
      );
    }
    render(<Test />);
    const trigger = screen.getByRole('button', {name: 'Help'});
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(anchorNameOf(trigger)).toBe('');
    expect(anchorNameOf(screen.getByTestId('region'))).toMatch(
      /^--astryx-layer-/,
    );
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
});
