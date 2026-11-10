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
import {__resetDevWarnings} from '../utils/devWarning';

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

  it('warns in development when the anchor is a shape or a nested <svg> inside an <svg>', () => {
    __resetDevWarnings();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    type Target = 'svg' | 'inHtml' | 'inForeignObject' | 'nested' | 'shape';
    function Test({target}: {target: Target}) {
      const svgRef = useRef<SVGSVGElement>(null);
      const inHtmlRef = useRef<SVGSVGElement>(null);
      const inForeignObjectRef = useRef<SVGSVGElement>(null);
      const nestedRef = useRef<SVGSVGElement>(null);
      const barRef = useRef<SVGRectElement>(null);
      const anchors = {
        svg: svgRef,
        inHtml: inHtmlRef,
        inForeignObject: inForeignObjectRef,
        nested: nestedRef,
        shape: barRef,
      };
      return (
        <>
          <svg ref={svgRef} width={40} height={40}>
            <rect ref={barRef} width={10} height={10} />
            <svg ref={nestedRef} width={10} height={10} />
            <foreignObject width={20} height={20}>
              <svg ref={inForeignObjectRef} width={10} height={10} />
              <div>
                <svg ref={inHtmlRef} width={10} height={10} />
              </div>
            </foreignObject>
          </svg>
          <Triggerless
            anchor={anchors[target]}
            label="Note"
            content={<span>Body</span>}
          />
        </>
      );
    }
    const mentionsShape = () =>
      warn.mock.calls.some(([message]) =>
        String(message).includes('inside an <svg>'),
      );
    const {rerender} = render(<Test target="svg" />);
    expect(mentionsShape()).toBe(false);
    // An <svg> in <foreignObject> has a box: directly, or in its HTML.
    rerender(<Test target="inForeignObject" />);
    expect(mentionsShape()).toBe(false);
    rerender(<Test target="inHtml" />);
    expect(mentionsShape()).toBe(false);
    // An <svg> directly inside an <svg> has none, as a shape has none.
    rerender(<Test target="nested" />);
    expect(mentionsShape()).toBe(true);
    __resetDevWarnings();
    warn.mockClear();
    rerender(<Test target="shape" />);
    expect(mentionsShape()).toBe(true);
  });

  it.each([
    ['a table cell', 'td'],
    ['an <svg> element', 'svg'],
  ] as const)('anchors to %s', (_name, tag) => {
    function Test() {
      const ref = useRef<Element>(null);
      return (
        <>
          {tag === 'td' ? (
            <table>
              <tbody>
                <tr>
                  <td
                    ref={ref as React.RefObject<HTMLTableCellElement>}
                    data-testid="target">
                    Revenue
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <svg
              ref={ref as React.RefObject<SVGSVGElement>}
              data-testid="target"
              width={20}
              height={20}
            />
          )}
          <Triggerless anchor={ref} label="Note" content={<span>Body</span>} />
        </>
      );
    }
    render(<Test />);
    expect(anchorNameOf(screen.getByTestId('target'))).toMatch(
      /^--astryx-layer-/,
    );
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

  it('waits to open until an anchor that does not exist yet attaches', async () => {
    const onShow = vi.fn();
    function Late() {
      const [isMounted, setIsMounted] = useState(false);
      const popover = usePopover({
        // A new function on each render, so the render that mounts the
        // target reads it again.
        anchor: () => document.querySelector('[data-late]'),
        dialogLabel: 'Late',
        onShow,
      });
      const {show} = popover;
      useEffect(() => {
        show();
      }, [show]);
      return (
        <>
          {isMounted && <div data-late="">Late target</div>}
          <button type="button" onClick={() => setIsMounted(true)}>
            Load
          </button>
          {popover.render(<button type="button">Inside</button>)}
          <span data-testid="state">{popover.isOpen ? 'open' : 'closed'}</span>
        </>
      );
    }
    render(<Late />);
    expect(onShow).not.toHaveBeenCalled();
    expect(screen.getByTestId('state')).toHaveTextContent('closed');

    const load = screen.getByRole('button', {name: 'Load'});
    fireEvent.pointerDown(load);
    fireEvent.pointerUp(load);
    fireEvent.click(load);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state')).toHaveTextContent('open');
    expect(anchorNameOf(query('[data-late]'))).toMatch(/^--astryx-layer-/);
    await vi.waitFor(() => {
      expect(
        screen.getByRole('button', {name: 'Inside', hidden: true}),
      ).toHaveFocus();
    });
  });

  it('opens a waiting show() on the next render, when a ref anchor attaches', async () => {
    function LateRef() {
      const [isMounted, setIsMounted] = useState(false);
      const anchorRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({anchor: anchorRef, dialogLabel: 'Late ref'});
      const {show} = popover;
      useEffect(() => {
        show();
      }, [show]);
      return (
        <>
          {isMounted && (
            <div ref={anchorRef} data-late-ref="">
              Late target
            </div>
          )}
          <button type="button" onClick={() => setIsMounted(true)}>
            Load
          </button>
          {popover.render(<button type="button">Inside</button>)}
          <span data-testid="ref-state">
            {popover.isOpen ? 'open' : 'closed'}
          </span>
        </>
      );
    }
    render(<LateRef />);
    expect(screen.getByTestId('ref-state')).toHaveTextContent('closed');
    fireEvent.click(screen.getByRole('button', {name: 'Load'}));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('ref-state')).toHaveTextContent('open');
    expect(anchorNameOf(query('[data-late-ref]'))).toMatch(/^--astryx-layer-/);
  });

  it("shows no surface while an open popover's anchor is gone", () => {
    function Test() {
      const [isMounted, setIsMounted] = useState(true);
      const anchorRef = useRef<HTMLDivElement>(null);
      return (
        <>
          {isMounted && (
            <div ref={anchorRef} data-target="">
              Target
            </div>
          )}
          <button type="button" onClick={() => setIsMounted(value => !value)}>
            Toggle
          </button>
          <Triggerless
            anchor={anchorRef}
            label="Gone"
            content={<span>Gone content</span>}
          />
        </>
      );
    }
    render(<Test />);
    const layer = screen.getByText('Gone content').closest('[popover]');
    if (layer == null) {
      throw new Error('No layer');
    }
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');

    fireEvent.click(screen.getByRole('button', {name: 'Toggle'}));
    expect(getComputedStyle(layer).visibility).toBe('hidden');

    fireEvent.click(screen.getByRole('button', {name: 'Toggle'}));
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');
    expect(anchorNameOf(query('[data-target]'))).toMatch(/^--astryx-layer-/);
  });
});
