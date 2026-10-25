// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useFocusTrap.test.tsx
 * @input Uses vitest, @testing-library/react, useFocusTrap hook
 * @output Unit tests for useFocusTrap tabbable-element model + Escape/IME guard
 * @position Testing; validates useFocusTrap.ts focusable detection + dismissal coordination
 *
 * SYNC: When useFocusTrap.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
} from '@testing-library/react';
import {createPortal} from 'react-dom';
import {FOCUSABLE_SELECTOR} from './focusableSelector';
import {useFocusTrap} from './useFocusTrap';

function Trap({children}: {children: React.ReactNode}) {
  const {containerRef, focusFirst} = useFocusTrap<HTMLDivElement>({
    isActive: true,
  });
  return (
    <div>
      <button type="button" data-testid="outside">
        Outside
      </button>
      <div ref={containerRef} data-testid="trap">
        {children}
      </div>
      <button type="button" onClick={focusFirst} data-testid="focus-first">
        Focus first
      </button>
    </div>
  );
}

function EscapeTrap({
  isActive,
  onEscape,
  label,
}: {
  isActive: boolean;
  onEscape: () => void;
  label: string;
}) {
  const {containerRef} = useFocusTrap<HTMLDivElement>({isActive, onEscape});
  return (
    <div ref={containerRef} data-testid={label}>
      <button type="button">{label}-btn</button>
    </div>
  );
}

function NestedInnerTrap({onEscape}: {onEscape: () => void}) {
  const {containerRef} = useFocusTrap<HTMLDivElement>({
    isActive: true,
    onEscape,
  });
  return (
    <div ref={containerRef} data-testid="nested-inner">
      <button type="button">inner-btn</button>
    </div>
  );
}

function NestedTraps({
  onOuterEscape,
  onInnerEscape,
  showInner = true,
}: {
  onOuterEscape: () => void;
  onInnerEscape: () => void;
  showInner?: boolean;
}) {
  const {containerRef} = useFocusTrap<HTMLDivElement>({
    isActive: true,
    onEscape: onOuterEscape,
  });
  return (
    <div ref={containerRef} data-testid="nested-outer">
      <button type="button">outer-btn</button>
      {showInner && <NestedInnerTrap onEscape={onInnerEscape} />}
    </div>
  );
}

function RestoreTrap({isActive}: {isActive: boolean}) {
  const {containerRef} = useFocusTrap<HTMLDivElement>({isActive});
  return (
    <div ref={containerRef} data-testid="restore-trap">
      <button type="button" data-testid="inside">
        Inside trap
      </button>
    </div>
  );
}

function RestoreFixture({
  isActive,
  showPrev = true,
  showTrap = true,
}: {
  isActive: boolean;
  showPrev?: boolean;
  showTrap?: boolean;
}) {
  return (
    <div>
      {showPrev && (
        <button type="button" data-testid="prev">
          Previously focused
        </button>
      )}
      <button type="button" data-testid="other">
        Other outside
      </button>
      {showTrap && <RestoreTrap isActive={isActive} />}
    </div>
  );
}

describe('useFocusTrap tabbable model (infra-8)', () => {
  it('treats a contenteditable as focusable (focusFirst lands on it)', () => {
    render(
      <Trap>
        <div
          contentEditable
          data-testid="editor"
          suppressContentEditableWarning>
          Type here
        </div>
      </Trap>,
    );
    fireEvent.click(screen.getByTestId('focus-first'));
    expect(screen.getByTestId('editor')).toHaveFocus();
  });

  it('ignores an inert subtree when finding focusables', () => {
    render(
      <Trap>
        <div inert>
          <button type="button" data-testid="inert-btn">
            Inert
          </button>
        </div>
        <button type="button" data-testid="real-btn">
          Real
        </button>
      </Trap>,
    );
    fireEvent.click(screen.getByTestId('focus-first'));
    // Focus skips the inert button and lands on the real one.
    expect(screen.getByTestId('real-btn')).toHaveFocus();
  });

  it('ignores an aria-hidden subtree when finding focusables', () => {
    render(
      <Trap>
        <div aria-hidden="true">
          <button type="button" data-testid="aria-hidden-btn">
            Hidden from AT
          </button>
        </div>
        <button type="button" data-testid="real-btn">
          Real
        </button>
      </Trap>,
    );
    fireEvent.click(screen.getByTestId('focus-first'));
    // An element AT cannot perceive must not be a trap tab stop (WCAG 4.1.2).
    expect(screen.getByTestId('real-btn')).toHaveFocus();
  });

  it('excludes an aria-hidden focusable from the Tab wrap boundary', () => {
    render(
      <Trap>
        <button type="button" data-testid="first">
          First
        </button>
        <button type="button" data-testid="visible-last">
          Visible last
        </button>
        <div aria-hidden="true">
          <button type="button" data-testid="aria-hidden-btn">
            Hidden from AT
          </button>
        </div>
      </Trap>,
    );
    // The last VISIBLE-to-AT element is the wrap boundary: Tab from it wraps
    // to the first element instead of landing on the aria-hidden button.
    screen.getByTestId('visible-last').focus();
    fireEvent.keyDown(document, {key: 'Tab'});
    expect(screen.getByTestId('first')).toHaveFocus();
  });

  it('moves from a programmatic container focus target into the tabbable cycle', () => {
    render(
      <Trap>
        <button type="button" data-testid="first">
          First
        </button>
        <button type="button" data-testid="last">
          Last
        </button>
      </Trap>,
    );
    const trap = screen.getByTestId('trap');
    trap.tabIndex = -1;
    trap.focus();

    fireEvent.keyDown(document, {key: 'Tab'});

    expect(screen.getByTestId('first')).toHaveFocus();
  });

  it('moves backward from a programmatic container focus target to the last tabbable control', () => {
    render(
      <Trap>
        <button type="button" data-testid="first">
          First
        </button>
        <button type="button" data-testid="last">
          Last
        </button>
      </Trap>,
    );
    const trap = screen.getByTestId('trap');
    trap.tabIndex = -1;
    trap.focus();

    fireEvent.keyDown(document, {key: 'Tab', shiftKey: true});

    expect(screen.getByTestId('last')).toHaveFocus();
  });

  it('keeps a programmatic focus target when the trap has no tabbable controls', () => {
    render(
      <Trap>
        <div tabIndex={-1} data-testid="programmatic-target">
          Read-only dialog content
        </div>
      </Trap>,
    );
    const target = screen.getByTestId('programmatic-target');
    target.focus();

    expect(fireEvent.keyDown(target, {key: 'Tab'})).toBe(false);
    expect(target).toHaveFocus();
    expect(screen.getByTestId('outside')).not.toHaveFocus();
  });

  it('leaves Tab alone when focus is outside a trap with no tabbable controls', () => {
    render(
      <Trap>
        <div role="option" tabIndex={-1} data-testid="option">
          Option
        </div>
      </Trap>,
    );
    const outside = screen.getByTestId('outside');
    outside.focus();

    expect(fireEvent.keyDown(outside, {key: 'Tab'})).toBe(true);
  });
});

describe('FOCUSABLE_SELECTOR href matching', () => {
  // Only real links (<a href>/<area href>) are focusable via href. A bare
  // [href] term also matched non-focusable elements carrying href (e.g. a
  // <link> in the head, or a custom element), which useFocusTrap would then
  // treat as tab stops when computing trap boundaries.
  it('matches real links but not other elements carrying href', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<a href="#a" data-testid="anchor">Anchor</a>' +
      '<map name="m">' +
      '<area href="#area" shape="rect" coords="0,0,1,1" data-testid="area" />' +
      '</map>' +
      '<span href="#span" data-testid="span">Span</span>' +
      '<link href="#link" data-testid="link" />';

    const matches = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    const byTestId = (id: string) =>
      container.querySelector(`[data-testid="${id}"]`);

    // Real links are focusable via href.
    expect(matches).toContain(byTestId('anchor'));
    expect(matches).toContain(byTestId('area'));
    // Non-link elements carrying href are not focusable and must be excluded.
    expect(matches).not.toContain(byTestId('span'));
    expect(matches).not.toContain(byTestId('link'));
  });

  it('treats an <a href> inside a trap as focusable (focusFirst lands on it)', () => {
    render(
      <Trap>
        <a href="#link" data-testid="anchor">
          Link
        </a>
      </Trap>,
    );
    fireEvent.click(screen.getByTestId('focus-first'));
    expect(screen.getByTestId('anchor')).toHaveFocus();
  });
});

describe('useFocusTrap Escape coordination', () => {
  it('calls onEscape for a single active trap', () => {
    const onEscape = vi.fn();
    render(<EscapeTrap isActive onEscape={onEscape} label="only" />);
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('only the top-most trap responds to Escape when nested', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <>
        <EscapeTrap isActive onEscape={outer} label="outer" />
        <EscapeTrap isActive onEscape={inner} label="inner" />
      </>,
    );
    // The most recently activated trap (inner) is on top.
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('ignores Escape during IME composition', () => {
    const onEscape = vi.fn();
    render(<EscapeTrap isActive onEscape={onEscape} label="ime" />);
    fireEvent.keyDown(document, {key: 'Escape', isComposing: true});
    expect(onEscape).not.toHaveBeenCalled();
    // keyCode 229 (composition) is also ignored
    fireEvent.keyDown(document, {key: 'Escape', keyCode: 229});
    expect(onEscape).not.toHaveBeenCalled();
    // a normal Escape still works
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('resolves Escape to the DOM-nested inner trap when both mount in one commit', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    // Outer and inner mount in the SAME React commit. React runs child
    // effects before parent effects, so the inner trap is PUSHED first —
    // DOM containment, not push order, must decide who answers Escape.
    render(<NestedTraps onOuterEscape={outer} onInnerEscape={inner} />);
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('falls back to the outer trap once the nested inner trap unmounts', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const {rerender} = render(
      <NestedTraps onOuterEscape={outer} onInnerEscape={inner} />,
    );
    rerender(
      <NestedTraps
        onOuterEscape={outer}
        onInnerEscape={inner}
        showInner={false}
      />,
    );
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).not.toHaveBeenCalled();
  });

  it('does not respond after the trap is deactivated', () => {
    const onEscape = vi.fn();
    const {rerender} = render(
      <EscapeTrap isActive onEscape={onEscape} label="toggle" />,
    );
    rerender(
      <EscapeTrap isActive={false} onEscape={onEscape} label="toggle" />,
    );
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe('useFocusTrap focus restoration', () => {
  it('restores focus to the previously-focused element when deactivated', () => {
    const {rerender} = render(<RestoreFixture isActive={false} />);
    const prev = screen.getByTestId('prev');
    prev.focus();
    expect(prev).toHaveFocus();

    // Activate the trap (captures `prev` as the restore target) and move focus
    // inside it, as auto-focus or a keyboard user would.
    rerender(<RestoreFixture isActive={true} />);
    screen.getByTestId('inside').focus();
    expect(screen.getByTestId('inside')).toHaveFocus();

    // Deactivating returns focus to where it was before the trap opened.
    rerender(<RestoreFixture isActive={false} />);
    expect(prev).toHaveFocus();
  });

  it('does not steal focus when it was moved elsewhere outside the trap', () => {
    const {rerender} = render(<RestoreFixture isActive={false} />);
    const prev = screen.getByTestId('prev');
    prev.focus();

    rerender(<RestoreFixture isActive={true} />);
    // The user (or a consumer that self-restores) moves focus to a different
    // outside control while the trap is open.
    const other = screen.getByTestId('other');
    other.focus();

    rerender(<RestoreFixture isActive={false} />);
    // Focus is left where the user put it — not yanked back to `prev`.
    expect(other).toHaveFocus();
    expect(prev).not.toHaveFocus();
  });

  it('does not crash or restore when the captured element was removed', () => {
    const {rerender} = render(<RestoreFixture isActive={false} />);
    const prev = screen.getByTestId('prev');
    prev.focus();

    rerender(<RestoreFixture isActive={true} />);
    screen.getByTestId('inside').focus();

    // Remove the captured element from the DOM before the trap deactivates.
    rerender(<RestoreFixture isActive={true} showPrev={false} />);
    expect(() =>
      rerender(<RestoreFixture isActive={false} showPrev={false} />),
    ).not.toThrow();
  });

  it('restores focus when the trap unmounts while active', () => {
    const {rerender} = render(
      <RestoreFixture isActive={true} showTrap={false} />,
    );
    const prev = screen.getByTestId('prev');
    prev.focus();

    // Mounting the trap active captures `prev`; then focus moves inside it.
    rerender(<RestoreFixture isActive={true} showTrap={true} />);
    screen.getByTestId('inside').focus();
    expect(screen.getByTestId('inside')).toHaveFocus();

    // Unmounting the trap (cleanup path, not an isActive flip) still restores.
    rerender(<RestoreFixture isActive={true} showTrap={false} />);
    expect(prev).toHaveFocus();
  });

  it('does not restore focus when focus never entered the trap', () => {
    // Reproduces the Typeahead/PowerSearch scenario from #5651: a popup that
    // opens with role="none" and hasAutoFocus={false} keeps DOM focus on its
    // anchor input. The trap is active but focus never enters the container.
    const {rerender} = render(<RestoreFixture isActive={false} />);
    const prev = screen.getByTestId('prev');
    prev.focus();
    expect(prev).toHaveFocus();

    // Activate the trap — focus stays on prev (outside the container).
    rerender(<RestoreFixture isActive={true} />);

    // Simulate an outside click: the browser blurs the input and focus falls
    // to <body> before the layer's light dismiss hides it.
    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();

    // Deactivating should NOT restore focus to prev — focus never entered the
    // trap, so restoring would cancel the blur the user asked for.
    rerender(<RestoreFixture isActive={false} />);
    expect(prev).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('still restores focus when focus entered the trap and was then lost', () => {
    // Complement to the test above: focus DID enter the trap (Dialog,
    // DropdownMenu, a Typeahead option click), then the element was blurred
    // so activeElement falls to <body>. The restore should still fire.
    const {rerender} = render(<RestoreFixture isActive={false} />);
    const prev = screen.getByTestId('prev');
    prev.focus();

    rerender(<RestoreFixture isActive={true} />);
    // Focus enters the trap, as auto-focus or a keyboard user would.
    screen.getByTestId('inside').focus();
    expect(screen.getByTestId('inside')).toHaveFocus();

    // Focus is lost from inside the trap — e.g. the trap content was removed
    // or the user tabbed away — so activeElement falls to <body>.
    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();

    // Because focus was inside the trap at some point, the restore fires and
    // returns focus to the element that was focused before activation.
    rerender(<RestoreFixture isActive={false} />);
    expect(prev).toHaveFocus();
  });
});

describe('useFocusTrap in a second document', () => {
  // A same-origin iframe stands in for any second document an app renders a
  // trap into through a portal, Document Picture-in-Picture included. Its
  // elements belong to the iframe's own window, and its key presses and focus
  // changes never reach this document.
  let frame: HTMLIFrameElement;
  let secondDocument: Document;

  beforeEach(() => {
    frame = document.createElement('iframe');
    document.body.appendChild(frame);
    secondDocument = frame.contentDocument!;
  });

  afterEach(() => {
    // Unmount before the frame goes, or React removes nodes from a document
    // that no longer exists.
    cleanup();
    frame.remove();
  });

  it('keeps Tab on a programmatic focus target when nothing inside is tabbable', () => {
    render(
      createPortal(
        <Trap>
          <div tabIndex={-1} data-testid="programmatic-target">
            Read-only dialog content
          </div>
        </Trap>,
        secondDocument.body,
      ),
    );
    const target = within(secondDocument.body).getByTestId(
      'programmatic-target',
    );
    target.focus();

    expect(fireEvent.keyDown(target, {key: 'Tab'})).toBe(false);
    expect(target).toHaveFocus();
  });

  it('returns focus to the element focused before it in that document', () => {
    const {rerender} = render(
      createPortal(<RestoreFixture isActive={false} />, secondDocument.body),
    );
    const view = within(secondDocument.body);
    const prev = view.getByTestId('prev');
    prev.focus();

    rerender(
      createPortal(<RestoreFixture isActive={true} />, secondDocument.body),
    );
    view.getByTestId('inside').focus();
    (secondDocument.activeElement as HTMLElement).blur();

    rerender(
      createPortal(<RestoreFixture isActive={false} />, secondDocument.body),
    );
    expect(prev).toHaveFocus();
  });
});
