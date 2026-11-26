// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverAnchor.test.tsx
 * @input usePopover with `anchorRef`
 * @output Tests for an anchor apart from the trigger
 * @position Colocated with usePopover.tsx
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import React, {
  StrictMode,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {usePopover} from './usePopover';
import {Button} from '../Button/Button';
import {Selector} from '../Selector/Selector';
import {MultiSelector} from '../MultiSelector/MultiSelector';
import {ComplexSelector} from '../ComplexSelector/ComplexSelector';
import {inTabOrder} from '../hooks/focusableSelector';
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
  anchorRef: RefObject<Element | null>;
  label: string;
  content: ReactNode;
  onHide?: () => void;
}

/** A popover with an anchor and no trigger, opened from code on mount. */
function Triggerless({anchorRef, label, content, onHide}: TriggerlessProps) {
  const popover = usePopover({
    anchorRef,
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
      const popover = usePopover({anchorRef: cellRef, dialogLabel: 'Edit'});
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

    // The anchor has no handler: a press on it does not open the popover.
    fireEvent.click(cell);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-controls');
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
        anchorRef: hasAnchor ? regionRef : undefined,
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
            anchorRef={chartRef}
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
            anchorRef={anchors[target]}
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
          <Triggerless
            anchorRef={ref}
            label="Note"
            content={<span>Body</span>}
          />
        </>
      );
    }
    render(<Test />);
    expect(anchorNameOf(screen.getByTestId('target'))).toMatch(
      /^--astryx-layer-/,
    );
  });

  it('moves to the element the ref holds on the next show(), without remounting', () => {
    const onHide = vi.fn();
    function Test() {
      const anchorRef = useRef<Element | null>(null);
      const popover = usePopover({
        anchorRef,
        dialogLabel: 'Row editor',
        hasLightDismiss: false,
        onHide,
      });
      const {show} = popover;
      const edit = (event: React.MouseEvent<HTMLButtonElement>) => {
        anchorRef.current = event.currentTarget;
        show();
      };
      return (
        <>
          <button type="button" data-row="a" onClick={edit}>
            Edit A
          </button>
          <button type="button" data-row="b" onClick={edit}>
            Edit B
          </button>
          {popover.render(
            <>
              <input aria-label="Value" />
              <input aria-label="Note" />
            </>,
          )}
        </>
      );
    }
    render(<Test />);
    const rowA = query('[data-row="a"]');
    const rowB = query('[data-row="b"]');
    fireEvent.click(rowA);
    const input = screen.getByRole('textbox', {name: 'Value', hidden: true});
    expect(anchorNameOf(rowA)).toMatch(/^--astryx-layer-/);
    const note = screen.getByRole('textbox', {name: 'Note', hidden: true});
    act(() => note.focus());

    fireEvent.click(rowB);
    // The move runs no initial focus again.
    expect(note).toHaveFocus();

    expect(anchorNameOf(rowA)).toBe('');
    expect(anchorNameOf(rowB)).toMatch(/^--astryx-layer-/);
    // Same surface, still open.
    expect(screen.getByRole('textbox', {name: 'Value', hidden: true})).toBe(
      input,
    );
    expect(onHide).not.toHaveBeenCalled();
  });

  it('does not watch the page: a new element is read on the next render', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const first = document.createElement('span');
    host.append(first);
    const anchorRef: {current: Element | null} = {current: first};
    const editor = () => (
      <Triggerless
        anchorRef={anchorRef}
        label="Editor"
        content={<span>Editor</span>}
      />
    );
    const {rerender} = render(editor());
    expect(anchorNameOf(first)).toMatch(/^--astryx-layer-/);

    const replacement = document.createElement('span');
    await act(async () => {
      first.remove();
      host.append(replacement);
      anchorRef.current = replacement;
      await Promise.resolve();
    });
    // Nothing observes the ref or the page for a new element.
    expect(anchorNameOf(replacement)).toBe('');

    rerender(editor());
    expect(anchorNameOf(replacement)).toMatch(/^--astryx-layer-/);
    host.remove();
  });

  it('waits to open until the ref holds an element, and opens on the next show()', async () => {
    const onShow = vi.fn();
    function Late() {
      const anchorRef = useRef<Element | null>(null);
      const popover = usePopover({anchorRef, dialogLabel: 'Late', onShow});
      const {show} = popover;
      useEffect(() => {
        show();
      }, [show]);
      return (
        <>
          <div data-late="">Late target</div>
          <button
            type="button"
            onClick={() => {
              anchorRef.current = document.querySelector('[data-late]');
              show();
            }}>
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

  it('opens a waiting show() on the next render, when React attaches the ref', async () => {
    function LateRef() {
      const [isMounted, setIsMounted] = useState(false);
      const anchorRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({anchorRef, dialogLabel: 'Late ref'});
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
            anchorRef={anchorRef}
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

  it('shows no surface while the ref holds an element that left the document', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const target = document.createElement('span');
    host.append(target);
    const anchorRef: {current: Element | null} = {current: target};
    const editor = () => (
      <Triggerless
        anchorRef={anchorRef}
        label="Detached"
        content={<span>Detached content</span>}
      />
    );
    const {rerender} = render(editor());
    const layer = screen.getByText('Detached content').closest('[popover]');
    if (layer == null) {
      throw new Error('No layer');
    }
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');

    // The ref still holds the element; it is no longer in the document.
    target.remove();
    rerender(editor());
    expect(getComputedStyle(layer).visibility).toBe('hidden');

    host.append(target);
    rerender(editor());
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');
    expect(anchorNameOf(target)).toMatch(/^--astryx-layer-/);
    host.remove();
  });

  it('waits to open while the ref holds an element that is not in the document', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const target = document.createElement('span');
    const anchorRef: {current: Element | null} = {current: target};
    function Late() {
      const popover = usePopover({anchorRef, dialogLabel: 'Detached'});
      const {show} = popover;
      useEffect(() => {
        show();
      }, [show]);
      return (
        <>
          {popover.render(<span>Body</span>)}
          <span data-testid="state">{popover.isOpen ? 'open' : 'closed'}</span>
        </>
      );
    }
    const {rerender} = render(<Late />);
    expect(screen.getByTestId('state')).toHaveTextContent('closed');

    host.append(target);
    rerender(<Late />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('open');
    expect(anchorNameOf(target)).toMatch(/^--astryx-layer-/);
    host.remove();
  });

  it('takes its anchor name off the anchor when an open popover unmounts', () => {
    function Test() {
      const [isEditing, setIsEditing] = useState(true);
      const cellRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={cellRef} data-testid="cell" />
          <button type="button" onClick={() => setIsEditing(false)}>
            Done
          </button>
          {isEditing && (
            <Triggerless
              anchorRef={cellRef}
              label="Editor"
              content={<span>Editor</span>}
            />
          )}
        </>
      );
    }
    render(<Test />);
    const cell = screen.getByTestId('cell');
    expect(anchorNameOf(cell)).toMatch(/^--astryx-layer-/);

    fireEvent.click(screen.getByRole('button', {name: 'Done'}));
    expect(anchorNameOf(cell)).toBe('');
  });

  it('keeps the anchor when a trigger mounts after the anchor is bound', () => {
    function Test() {
      const [hasTrigger, setHasTrigger] = useState(false);
      const cellRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({
        anchorRef: cellRef,
        dialogLabel: 'Edit',
        hasLightDismiss: false,
        hasAutoFocus: false,
      });
      const {show} = popover;
      useEffect(() => {
        show();
      }, [show]);
      return (
        <>
          <div ref={cellRef} data-testid="cell" />
          <button type="button" onClick={() => setHasTrigger(true)}>
            Add trigger
          </button>
          {hasTrigger && (
            <button
              type="button"
              ref={popover.triggerRef}
              {...popover.triggerProps}>
              Edit
            </button>
          )}
          {popover.render(<span>Editor</span>)}
        </>
      );
    }
    render(<Test />);
    const cell = screen.getByTestId('cell');
    expect(anchorNameOf(cell)).toMatch(/^--astryx-layer-/);

    fireEvent.click(screen.getByRole('button', {name: 'Add trigger'}));
    expect(anchorNameOf(cell)).toMatch(/^--astryx-layer-/);
    expect(anchorNameOf(screen.getByRole('button', {name: 'Edit'}))).toBe('');
  });

  it('binds the anchor again when effects run again', () => {
    function Test() {
      const cellRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({anchorRef: cellRef, dialogLabel: 'Edit'});
      return (
        <>
          <div ref={cellRef} data-testid="cell" />
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
    // StrictMode runs each effect, its cleanup, and the effect again.
    render(
      <StrictMode>
        <Test />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Edit'}));
    expect(screen.getByRole('button', {name: 'Edit'})).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(anchorNameOf(screen.getByTestId('cell'))).toMatch(
      /^--astryx-layer-/,
    );
  });

  it('waits to open when the bound element left the document since the last render', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const target = document.createElement('span');
    host.append(target);
    const anchorRef: {current: Element | null} = {current: target};
    function Test() {
      const popover = usePopover({anchorRef, dialogLabel: 'Detached'});
      return (
        <>
          <button type="button" onClick={() => popover.show()}>
            Open
          </button>
          {popover.render(<span>Body</span>)}
          <span data-testid="state">{popover.isOpen ? 'open' : 'closed'}</span>
        </>
      );
    }
    render(<Test />);
    // No render runs between the removal and the show().
    target.remove();
    fireEvent.click(screen.getByRole('button', {name: 'Open'}));
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
    host.remove();
  });

  it('moves focus to the trigger when the anchor leaves the document with focus in the popover', async () => {
    function Test() {
      const [isMounted, setIsMounted] = useState(true);
      const anchorRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({
        anchorRef,
        dialogLabel: 'Edit',
        hasLightDismiss: false,
      });
      return (
        <>
          {isMounted && <div ref={anchorRef} />}
          <button
            type="button"
            ref={popover.triggerRef}
            onClick={popover.toggle}
            {...popover.triggerProps}>
            Edit
          </button>
          <button type="button" onClick={() => setIsMounted(true)}>
            Restore row
          </button>
          {popover.render(
            <button type="button" onClick={() => setIsMounted(false)}>
              Remove row
            </button>,
          )}
        </>
      );
    }
    render(<Test />);
    const trigger = screen.getByRole('button', {name: 'Edit'});
    trigger.focus();
    fireEvent.click(trigger);
    const remove = screen.getByRole('button', {
      name: 'Remove row',
      hidden: true,
    });
    await waitFor(() => expect(remove).toHaveFocus());

    // The surface hides without its anchor; focus does not stay inside it.
    fireEvent.click(remove);
    await waitFor(() => expect(trigger).toHaveFocus());

    const layer = remove.closest('[popover]');
    if (layer == null) {
      throw new Error('No layer');
    }
    expect(getComputedStyle(layer).visibility).toBe('hidden');

    // The anchor returns and the surface shows; focus is not moved back.
    const restore = screen.getByRole('button', {name: 'Restore row'});
    restore.focus();
    fireEvent.click(restore);
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');
    expect(restore).toHaveFocus();
  });

  it('moves focus along the return chain when a popover with no trigger loses its anchor', async () => {
    function Test() {
      const [isMounted, setIsMounted] = useState(true);
      const anchorRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({
        anchorRef,
        dialogLabel: 'Note',
        hasLightDismiss: false,
      });
      const {show} = popover;
      return (
        <main>
          {isMounted && <div ref={anchorRef} />}
          <button type="button" onClick={() => show()}>
            Open
          </button>
          {popover.render(
            <button type="button" onClick={() => setIsMounted(false)}>
              Remove
            </button>,
          )}
        </main>
      );
    }
    render(<Test />);
    const opener = screen.getByRole('button', {name: 'Open'});
    opener.focus();
    fireEvent.click(opener);
    const remove = screen.getByRole('button', {name: 'Remove', hidden: true});
    await waitFor(() => expect(remove).toHaveFocus());

    fireEvent.click(remove);
    // The chain starts at the element focused when the popover opened.
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('keeps a popover that opens on mount anchored when effects run again', () => {
    function Test() {
      const anchorRef = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={anchorRef} data-target="">
            Target
          </div>
          <Triggerless
            anchorRef={anchorRef}
            label="Strict"
            content={<span>Strict content</span>}
          />
        </>
      );
    }
    render(
      <StrictMode>
        <Test />
      </StrictMode>,
    );
    const layer = screen.getByText('Strict content').closest('[popover]');
    if (layer == null) {
      throw new Error('No layer');
    }
    expect(anchorNameOf(query('[data-target]'))).toMatch(/^--astryx-layer-/);
    expect(getComputedStyle(layer).visibility).not.toBe('hidden');
  });

  describe('the invoker a popover takes its place in the Tab order from', () => {
    function Coachmark({
      isAnchorFocusable,
      hasTrigger,
      tabBehavior = 'pageOrder',
    }: {
      isAnchorFocusable: boolean;
      hasTrigger: boolean;
      tabBehavior?: 'contain' | 'pageOrder';
    }) {
      const anchorRef = useRef<HTMLDivElement>(null);
      const popover = usePopover({
        anchorRef,
        dialogLabel: 'Tip',
        tabBehavior,
        hasLightDismiss: false,
        hasAutoFocus: false,
      });
      return (
        <>
          <div
            ref={anchorRef}
            data-anchor=""
            tabIndex={isAnchorFocusable ? 0 : undefined}>
            Chart
          </div>
          {hasTrigger ? (
            <button
              type="button"
              ref={popover.triggerRef}
              {...popover.triggerProps}>
              Help
            </button>
          ) : null}
          <button type="button" onClick={() => popover.show()}>
            Start
          </button>
          {popover.render(<span>Tip content</span>)}
        </>
      );
    }

    function openAndReadSource(element: React.ReactElement) {
      const original = HTMLElement.prototype.showPopover;
      const show = vi.fn(function (
        this: HTMLElement,
        options?: ShowPopoverOptions,
      ) {
        original.call(this, options);
      });
      HTMLElement.prototype.showPopover = show;
      try {
        render(element);
        fireEvent.click(screen.getByRole('button', {name: 'Start'}));
        expect(show).toHaveBeenCalledOnce();
        return show.mock.calls[0][0]?.source;
      } finally {
        HTMLElement.prototype.showPopover = original;
      }
    }

    it("counts in a focus region's Tab order only in a browser that reads the option", () => {
      const order = () => {
        const anchor = document.querySelector<HTMLElement>('[data-anchor]');
        const start = screen.getByRole('button', {name: 'Start'});
        const close = screen.getByRole('button', {
          name: /close/i,
          hidden: true,
        });
        return inTabOrder([anchor as HTMLElement, start, close]).map(
          element => element.textContent,
        );
      };
      // The test environment's `showPopover` does not read its options.
      const {unmount} = render(
        <Coachmark isAnchorFocusable hasTrigger={false} />,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Start'}));
      const closeLabel = order()[2];
      expect(order()).toEqual(['Chart', 'Start', closeLabel]);
      unmount();

      const original = HTMLElement.prototype.showPopover;
      HTMLElement.prototype.showPopover = function (
        options?: ShowPopoverOptions,
      ) {
        void options?.source;
      };
      try {
        render(<Coachmark isAnchorFocusable hasTrigger={false} />);
        fireEvent.click(screen.getByRole('button', {name: 'Start'}));
        expect(order()).toEqual(['Chart', closeLabel, 'Start']);
      } finally {
        HTMLElement.prototype.showPopover = original;
      }
    });

    it('is the trigger when the popover has one', () => {
      const source = openAndReadSource(
        <Coachmark isAnchorFocusable hasTrigger />,
      );
      expect(source).toBe(screen.getByRole('button', {name: 'Help'}));
    });

    it('is the anchor when there is no trigger and the anchor takes focus', () => {
      const source = openAndReadSource(
        <Coachmark isAnchorFocusable hasTrigger={false} />,
      );
      expect(source).toBe(query('[data-anchor]'));
    });

    it('is nothing when there is no trigger and the anchor takes no focus', () => {
      const source = openAndReadSource(
        <Coachmark isAnchorFocusable={false} hasTrigger={false} />,
      );
      expect(source).toBeUndefined();
    });

    it('is the anchor that the ref holds when the layer element mounts again while the popover is open', () => {
      const step = {id: 'first'};
      const anchorRef = {
        get current() {
          return document.querySelector<HTMLElement>(
            `[data-step="${step.id}"]`,
          );
        },
      };
      function Steps() {
        const [mountKey, setMountKey] = useState('first');
        const popover = usePopover({
          anchorRef,
          dialogLabel: 'Tip',
          tabBehavior: 'pageOrder',
          hasLightDismiss: false,
          hasAutoFocus: false,
        });
        return (
          <>
            <button type="button" data-step="first">
              First
            </button>
            <button type="button" data-step="second">
              Second
            </button>
            <button type="button" onClick={() => popover.show()}>
              Start
            </button>
            <button
              type="button"
              onClick={() => {
                step.id = 'second';
                setMountKey('second');
              }}>
              Move
            </button>
            <React.Fragment key={mountKey}>
              {popover.render(<span>Tip content</span>)}
            </React.Fragment>
          </>
        );
      }
      const original = HTMLElement.prototype.showPopover;
      const sources: unknown[] = [];
      HTMLElement.prototype.showPopover = function (
        this: HTMLElement,
        options?: ShowPopoverOptions,
      ) {
        sources.push(options?.source);
        original.call(this, options);
      };
      try {
        render(<Steps />);
        fireEvent.click(screen.getByRole('button', {name: 'Start'}));
        fireEvent.click(screen.getByRole('button', {name: 'Move'}));
        expect(sources).toEqual([
          query('[data-step="first"]'),
          query('[data-step="second"]'),
        ]);
      } finally {
        HTMLElement.prototype.showPopover = original;
      }
    });

    function Wrapped({tabBehavior}: {tabBehavior: 'contain' | 'pageOrder'}) {
      const popover = usePopover({
        dialogLabel: 'Tip',
        tabBehavior,
        hasLightDismiss: false,
        hasAutoFocus: false,
      });
      return (
        <>
          <span ref={popover.triggerRef} data-wrapper="">
            <button type="button" {...popover.triggerProps}>
              Help
            </button>
          </span>
          <button type="button" onClick={() => popover.show()}>
            Start
          </button>
          {popover.render(<span>Tip content</span>)}
        </>
      );
    }

    it('is the control inside a wrapper trigger for a pageOrder popover', () => {
      const source = openAndReadSource(<Wrapped tabBehavior="pageOrder" />);
      expect(source).toBe(screen.getByRole('button', {name: 'Help'}));
    });

    it('stays the wrapper trigger itself for a contain popover', () => {
      const source = openAndReadSource(<Wrapped tabBehavior="contain" />);
      expect(source).toBe(query('[data-wrapper]'));
    });

    it('stays the anchor for a contain popover that also has a trigger', () => {
      const source = openAndReadSource(
        <Coachmark isAnchorFocusable hasTrigger tabBehavior="contain" />,
      );
      expect(source).toBe(query('[data-anchor]'));
    });
  });

  it('waits to open when the ref was emptied since the last render', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const target = document.createElement('span');
    host.append(target);
    const anchorRef: {current: Element | null} = {current: target};
    function Test() {
      const popover = usePopover({anchorRef, dialogLabel: 'Emptied'});
      return (
        <>
          <button type="button" onClick={() => popover.show()}>
            Open
          </button>
          {popover.render(<button type="button">Inside</button>)}
          <span data-testid="state">{popover.isOpen ? 'open' : 'closed'}</span>
        </>
      );
    }
    render(<Test />);
    // The element stays in the document; the ref no longer names it.
    anchorRef.current = null;
    const open = screen.getByRole('button', {name: 'Open'});
    open.focus();
    fireEvent.click(open);
    expect(screen.getByTestId('state')).toHaveTextContent('closed');
    expect(open).toHaveFocus();
    host.remove();
  });
  describe('the press scale of the control the anchor names', () => {
    const factorOf = (element: Element) =>
      (element as HTMLElement).style.getPropertyValue('--_astryx-press-scale');

    /** Two controls marked as an Astryx control that paints a press is. */
    function Pointer({isMounted = true}: {isMounted?: boolean}) {
      const anchorRef = useRef<Element | null>(null);
      const [target, setTarget] = useState('first');
      const popover = usePopover({
        anchorRef,
        dialogLabel: 'Tip',
        hasLightDismiss: false,
        hasAutoFocus: false,
      });
      return (
        <>
          <button
            type="button"
            ref={popover.triggerRef}
            onClick={popover.toggle}
            {...popover.triggerProps}>
            Show tip
          </button>
          <button type="button" onClick={() => setTarget('second')}>
            Point at second
          </button>
          {isMounted &&
            ['first', 'second'].map(name => (
              <button
                key={name}
                type="button"
                data-astryx-pressable=""
                data-testid={name}
                ref={element => {
                  if (name === target) {
                    anchorRef.current = element;
                  }
                }}>
                {name}
              </button>
            ))}
          {popover.render(<span>Tip</span>)}
        </>
      );
    }

    it('holds the control at rest while the popover is open, and frees it when the popover closes', () => {
      render(<Pointer />);
      const opener = screen.getByRole('button', {name: 'Show tip'});
      const first = screen.getByTestId('first');
      expect(factorOf(first)).toBe('');

      fireEvent.click(opener);
      expect(factorOf(first)).toBe('1');
      // The opener is the trigger, not the anchor.
      expect(factorOf(opener)).toBe('');

      fireEvent.click(opener);
      expect(factorOf(first)).toBe('');
    });

    it('moves the hold when the ref names another control', () => {
      render(<Pointer />);
      fireEvent.click(screen.getByRole('button', {name: 'Show tip'}));
      fireEvent.click(screen.getByRole('button', {name: 'Point at second'}));
      expect(factorOf(screen.getByTestId('first'))).toBe('');
      expect(factorOf(screen.getByTestId('second'))).toBe('1');
    });

    it('frees the control when an open popover unmounts', () => {
      function Test() {
        const [isShown, setIsShown] = useState(true);
        const controlRef = useRef<HTMLButtonElement>(null);
        return (
          <>
            <button
              type="button"
              ref={controlRef}
              data-astryx-pressable=""
              data-testid="control"
              onClick={() => setIsShown(false)}>
              Done
            </button>
            {isShown && (
              <Triggerless
                anchorRef={controlRef}
                label="Tip"
                content={<span>Tip</span>}
              />
            )}
          </>
        );
      }
      render(<Test />);
      const control = screen.getByTestId('control');
      expect(factorOf(control)).toBe('1');
      fireEvent.click(control);
      expect(factorOf(control)).toBe('');
    });

    it('frees the control when it leaves the document', () => {
      const {rerender} = render(<Pointer />);
      fireEvent.click(screen.getByRole('button', {name: 'Show tip'}));
      const first = screen.getByTestId('first');
      expect(factorOf(first)).toBe('1');
      rerender(<Pointer isMounted={false} />);
      expect(factorOf(first)).toBe('');
    });

    it('holds nothing when the trigger is the anchor', () => {
      function Test() {
        const popover = usePopover({dialogLabel: 'Tip'});
        return (
          <>
            <button
              type="button"
              data-astryx-pressable=""
              ref={popover.triggerRef}
              onClick={popover.toggle}
              {...popover.triggerProps}>
              Show tip
            </button>
            {popover.render(<span>Tip</span>)}
          </>
        );
      }
      render(<Test />);
      const trigger = screen.getByRole('button', {name: 'Show tip'});
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(factorOf(trigger)).toBe('');
    });

    it('holds the control around an anchor that is inside one, and writes nothing for an anchor in no control', () => {
      function Test() {
        const iconRef = useRef<HTMLSpanElement>(null);
        const cellRef = useRef<HTMLDivElement>(null);
        return (
          <>
            <button
              type="button"
              data-astryx-pressable=""
              data-testid="control">
              <span ref={iconRef} data-testid="icon" />
            </button>
            <div ref={cellRef} data-testid="cell" />
            <Triggerless
              anchorRef={iconRef}
              label="Icon tip"
              content={<span>Icon tip</span>}
            />
            <Triggerless
              anchorRef={cellRef}
              label="Cell tip"
              content={<span>Cell tip</span>}
            />
          </>
        );
      }
      render(<Test />);
      expect(factorOf(screen.getByTestId('control'))).toBe('1');
      expect(factorOf(screen.getByTestId('icon'))).toBe('');
      expect(factorOf(screen.getByTestId('cell'))).toBe('');
    });

    it('keeps the hold until every popover that points at the control closes', () => {
      function Test() {
        const controlRef = useRef<HTMLButtonElement>(null);
        const [shown, setShown] = useState(['first', 'second']);
        return (
          <>
            <button
              type="button"
              ref={controlRef}
              data-astryx-pressable=""
              data-testid="control">
              Control
            </button>
            {['first', 'second'].map(name => (
              <button
                key={name}
                type="button"
                onClick={() =>
                  setShown(names => names.filter(other => other !== name))
                }>
                {`Close ${name}`}
              </button>
            ))}
            {shown.map(name => (
              <Triggerless
                key={name}
                anchorRef={controlRef}
                label={name}
                content={<span>{name}</span>}
              />
            ))}
          </>
        );
      }
      render(<Test />);
      const control = screen.getByTestId('control');
      expect(factorOf(control)).toBe('1');
      fireEvent.click(screen.getByRole('button', {name: 'Close first'}));
      expect(factorOf(control)).toBe('1');
      fireEvent.click(screen.getByRole('button', {name: 'Close second'}));
      expect(factorOf(control)).toBe('');
    });

    it('is the factor that Button and the selector triggers scale by on a press', () => {
      render(
        <>
          <Button label="Save" />
          <Selector
            label="Status"
            variant="secondary"
            options={['Open', 'Closed']}
            value="Open"
            onChange={() => {}}
          />
          <MultiSelector
            label="Columns"
            variant="secondary"
            options={['Name', 'Email']}
            value={['Name']}
            onChange={() => {}}
          />
          <ComplexSelector<string>
            label="Density"
            variant="secondary"
            value="Compact"
            onChange={() => {}}
            triggerLabel="Compact">
            {() => <span>Options</span>}
          </ComplexSelector>
        </>,
      );
      // jsdom resolves no press state, so this reads the rules StyleX wrote.
      const css = Array.from(document.styleSheets)
        .flatMap(sheet => Array.from(sheet.cssRules))
        .map(rule => rule.cssText)
        .join('\n');
      // StyleX writes 0.98 as `.98`.
      expect(css).toMatch(/scale\(var\(--_astryx-press-scale, ?0?\.98\)\)/);
      // No control scales by a factor that the hold cannot reach.
      expect(css).not.toMatch(/scale\(0?\.98\)/);
      // Each control sets the factor to `initial` on the element that scales.
      expect(css).toMatch(/--_astryx-press-scale: ?initial/);
      for (const className of [
        'astryx-button',
        'astryx-selector',
        'astryx-multi-selector',
        'astryx-complex-selector',
      ]) {
        const scaled = document.querySelector(`.${className}`);
        expect(scaled, className).not.toBeNull();
        // The element that scales is the one the hold finds.
        expect(scaled?.closest('[data-astryx-pressable]'), className).toBe(
          scaled,
        );
      }
    });
  });
});
