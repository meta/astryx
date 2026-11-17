// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useLayerDismissal.test.tsx
 * @input Uses @testing-library/react, vitest
 * @output Tests for the shared layer dismissal stack
 * @position Colocated tests for useLayerDismissal + layerStack
 *
 * Every case here is "one Escape press, which layers reacted?" — the single
 * question the stack exists to answer.
 */

import {render, fireEvent, cleanup} from '@testing-library/react';
import {describe, expect, it, vi, afterEach, beforeEach} from 'vitest';
import {StrictMode, useRef} from 'react';
import {createPortal} from 'react-dom';

import {LayerDepthProvider} from './LayerDepthContext';
import {useLayerDismissal} from './useLayerDismissal';
import {resetLayerStackForTests} from './layerStack';
import type {LayerEscapeBehavior} from './layerStack';

afterEach(() => {
  resetLayerStackForTests();
});

/** A layer that registers itself and renders its children one level deeper. */
function Layer({
  onDismiss,
  behavior = 'close',
  isEnabled = true,
  isActive = true,
  isPresent,
  children,
}: {
  onDismiss: () => void;
  behavior?: LayerEscapeBehavior;
  isEnabled?: boolean;
  isActive?: boolean;
  isPresent?: () => boolean;
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLayerDismissal({
    isActive,
    onDismiss,
    escapeBehavior: behavior,
    isEnabled,
    isPresent,
    getContainer: () => containerRef.current,
  });
  return (
    <div ref={containerRef}>
      <LayerDepthProvider>{children}</LayerDepthProvider>
    </div>
  );
}

/** A layer that reports no depth — like a bare focus trap, which renders nothing. */
function FlatLayer({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLayerDismissal({
    isActive: true,
    onDismiss,
    getContainer: () => containerRef.current,
  });
  return <div ref={containerRef}>{children}</div>;
}

const pressEscape = () => fireEvent.keyDown(document, {key: 'Escape'});

describe('useLayerDismissal', () => {
  it('dismisses only the top-most layer when both open in the same commit', () => {
    // The regression: an inner and outer layer that mount together. React runs
    // child effects first, so registration order reports the inner layer as the
    // OLDER one — nesting, not order, has to decide.
    const outer = vi.fn();
    const inner = vi.fn();

    render(
      <Layer onDismiss={outer}>
        <Layer onDismiss={inner} />
      </Layer>,
    );

    pressEscape();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('falls through to the outer layer once the inner one closes', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const {rerender} = render(
      <Layer onDismiss={outer}>
        <Layer onDismiss={inner} />
      </Layer>,
    );
    rerender(<Layer onDismiss={outer} />);

    pressEscape();
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).not.toHaveBeenCalled();
  });

  it('dismisses the later of two unrelated layers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const {rerender} = render(<Layer onDismiss={first} />);
    rerender(
      <>
        <Layer onDismiss={first} />
        <Layer onDismiss={second} />
      </>,
    );

    pressEscape();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('resolves nesting by DOM containment when the tree reports equal depth', () => {
    // A bare focus trap renders nothing, so it cannot push a depth provider.
    // Containment is the only nesting signal those layers have.
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <FlatLayer onDismiss={outer}>
        <FlatLayer onDismiss={inner} />
      </FlatLayer>,
    );

    pressEscape();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  describe('escapeBehavior', () => {
    it("'close' consumes the press, so one Escape affects exactly one layer", () => {
      // A hover tip inside a modal: the tip is on top, so it takes the press
      // and the modal stays open. A second Escape closes the modal.
      const modal = vi.fn();
      const tip = vi.fn();
      render(
        <Layer onDismiss={modal}>
          <Layer onDismiss={tip} />
        </Layer>,
      );

      pressEscape();
      expect(tip).toHaveBeenCalledTimes(1);
      expect(modal).not.toHaveBeenCalled();
    });

    it("'block' consumes the press without dismissing anything", () => {
      const host = vi.fn();
      const required = vi.fn();
      render(
        <Layer onDismiss={host}>
          <Layer onDismiss={required} behavior="block" />
        </Layer>,
      );

      pressEscape();
      expect(required).not.toHaveBeenCalled();
      expect(host).not.toHaveBeenCalled();
    });
  });

  describe('registration order', () => {
    /** Two unrelated same-depth layers; the older one's behavior is a prop. */
    function Siblings({
      olderBehavior,
      onOlderDismiss,
      onNewerDismiss,
    }: {
      olderBehavior: LayerEscapeBehavior;
      onOlderDismiss: () => void;
      onNewerDismiss: () => void;
    }) {
      return (
        <>
          <Layer onDismiss={onOlderDismiss} behavior={olderBehavior} />
          <Layer onDismiss={onNewerDismiss} />
        </>
      );
    }

    it('keeps a layer below the ones that opened after it when its escapeBehavior changes', () => {
      // A Dialog whose `purpose` flips from required to info while it is open
      // re-registers with the stack. Re-registration must not reorder it above
      // a layer opened on top of it.
      const older = vi.fn();
      const newer = vi.fn();
      const {rerender} = render(
        <Siblings
          olderBehavior="block"
          onOlderDismiss={older}
          onNewerDismiss={newer}
        />,
      );
      rerender(
        <Siblings
          olderBehavior="close"
          onOlderDismiss={older}
          onNewerDismiss={newer}
        />,
      );

      pressEscape();
      expect(newer).toHaveBeenCalledTimes(1);
      expect(older).not.toHaveBeenCalled();
    });

    it('does not let a re-registered layer swallow a press meant for the layer above it', () => {
      // The same flip the other way: info to required. A `block` layer that
      // jumped the queue would consume the press and nothing would close.
      const older = vi.fn();
      const newer = vi.fn();
      const {rerender} = render(
        <Siblings
          olderBehavior="close"
          onOlderDismiss={older}
          onNewerDismiss={newer}
        />,
      );
      rerender(
        <Siblings
          olderBehavior="block"
          onOlderDismiss={older}
          onNewerDismiss={newer}
        />,
      );

      pressEscape();
      expect(newer).toHaveBeenCalledTimes(1);
      expect(older).not.toHaveBeenCalled();
    });

    it('moves a reopened unrelated layer above siblings that stayed open', () => {
      const first = vi.fn();
      const second = vi.fn();
      const {rerender} = render(
        <>
          <Layer onDismiss={first} />
          <Layer onDismiss={second} />
        </>,
      );

      rerender(
        <>
          <Layer onDismiss={first} isActive={false} />
          <Layer onDismiss={second} />
        </>,
      );
      rerender(
        <>
          <Layer onDismiss={first} />
          <Layer onDismiss={second} />
        </>,
      );

      pressEscape();
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
    });

    it('keeps ordering under StrictMode, which mounts every effect twice', () => {
      const first = vi.fn();
      const second = vi.fn();
      render(
        <StrictMode>
          <Layer onDismiss={first} />
          <Layer onDismiss={second} />
        </StrictMode>,
      );

      pressEscape();
      expect(second).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();
    });
  });

  describe('presence', () => {
    it('skips a registered layer that is not on screen', () => {
      // Hover layers stay registered for their lifetime because their open
      // state lags the DOM. An absent one must not claim the press — that is
      // exactly the bug where a HoverCard trigger ate Escapes while idle.
      const below = vi.fn();
      const absent = vi.fn();
      render(
        <Layer onDismiss={below}>
          <Layer onDismiss={absent} isPresent={() => false} />
        </Layer>,
      );

      pressEscape();
      expect(absent).not.toHaveBeenCalled();
      expect(below).toHaveBeenCalledTimes(1);
    });

    it('lets a present layer claim the press over the one beneath', () => {
      const below = vi.fn();
      const present = vi.fn();
      render(
        <Layer onDismiss={below}>
          <Layer onDismiss={present} isPresent={() => true} />
        </Layer>,
      );

      pressEscape();
      expect(present).toHaveBeenCalledTimes(1);
      expect(below).not.toHaveBeenCalled();
    });
  });

  describe('opting out', () => {
    it('skips a disabled layer entirely, so the press reaches the one below', () => {
      const below = vi.fn();
      const optedOut = vi.fn();
      render(
        <Layer onDismiss={below}>
          <Layer onDismiss={optedOut} isEnabled={false} />
        </Layer>,
      );

      pressEscape();
      expect(optedOut).not.toHaveBeenCalled();
      expect(below).toHaveBeenCalledTimes(1);
    });

    it('does not register an inactive layer', () => {
      const onDismiss = vi.fn();
      render(<Layer onDismiss={onDismiss} isActive={false} />);

      pressEscape();
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('deferring to content', () => {
    it('stands down when content already handled the press', () => {
      // preventDefault from inside the layer — an editor claiming Escape for
      // its own find widget, for instance.
      const onDismiss = vi.fn();
      render(
        <Layer onDismiss={onDismiss}>
          <button
            type="button"
            data-testid="editor"
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault();
              }
            }}
          />
        </Layer>,
      );

      fireEvent.keyDown(document.querySelector('[data-testid="editor"]')!, {
        key: 'Escape',
      });
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('ignores Escape that is cancelling an IME composition', () => {
      const onDismiss = vi.fn();
      render(<Layer onDismiss={onDismiss} />);

      fireEvent.keyDown(document, {key: 'Escape', isComposing: true});
      expect(onDismiss).not.toHaveBeenCalled();

      fireEvent.keyDown(document, {key: 'Escape', keyCode: 229});
      expect(onDismiss).not.toHaveBeenCalled();

      pressEscape();
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('claims the composing Escape so the browser raises no close request', () => {
      // Not dismissing is only half of it. An unclaimed Escape lets the browser
      // raise its own close request, which reaches the layer's `cancel` handler
      // and dismisses it on the same keypress — so the guard has to swallow the
      // press, not merely skip the dismissal.
      render(<Layer onDismiss={vi.fn()} />);
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'isComposing', {value: true});

      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves a composing Escape alone when no layer is on screen', () => {
      // With nothing to protect the press is not ours to take: an idle hover
      // layer in the tree must not suppress the page's own close watcher.
      render(<Layer onDismiss={vi.fn()} isPresent={() => false} />);
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'isComposing', {value: true});

      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('close requests the browser starts itself', () => {
    // The Android back gesture and the platform close watcher arrive as a
    // `cancel` with no keydown to read, so the keydown guard cannot see them.
    function CloseRequestLayer({onAsk}: {onAsk: (answer: boolean) => void}) {
      const {shouldDismissOnCloseRequest} = useLayerDismissal({
        isActive: true,
        onDismiss: () => {},
      });
      return (
        <>
          <input aria-label="composing field" />
          <button
            type="button"
            onClick={() => onAsk(shouldDismissOnCloseRequest())}>
            ask
          </button>
        </>
      );
    }

    const ask = (onAsk: ReturnType<typeof vi.fn>): boolean => {
      fireEvent.click(document.querySelector('button')!);
      return Boolean(onAsk.mock.lastCall?.[0]);
    };

    it('declines while an IME composition is running, and again once it ends', () => {
      const onAsk = vi.fn();
      render(<CloseRequestLayer onAsk={onAsk} />);
      const field = document.querySelector('input')!;

      expect(ask(onAsk)).toBe(true);

      fireEvent.compositionStart(field);
      expect(ask(onAsk)).toBe(false);

      fireEvent.compositionEnd(field);
      expect(ask(onAsk)).toBe(true);
    });

    it('stops declining when focus leaves a field mid-composition', () => {
      // A compositionend the stack never sees would otherwise leave the flag
      // stuck on, and every later back gesture would be swallowed.
      const onAsk = vi.fn();
      render(<CloseRequestLayer onAsk={onAsk} />);
      const field = document.querySelector('input')!;

      fireEvent.compositionStart(field);
      expect(ask(onAsk)).toBe(false);

      fireEvent.blur(field);
      expect(ask(onAsk)).toBe(true);
    });

    it('answers against the top-most layer of its own document', () => {
      // A layer that opened later in a second document is on top there, not
      // here: it cannot make a close request in this document decline.
      const onAsk = vi.fn();
      const frame = document.createElement('iframe');
      document.body.appendChild(frame);
      try {
        render(<CloseRequestLayer onAsk={onAsk} />);
        render(
          createPortal(
            <Layer onDismiss={vi.fn()} />,
            frame.contentDocument!.body,
          ),
        );

        expect(ask(onAsk)).toBe(true);
      } finally {
        cleanup();
        frame.remove();
      }
    });
  });

  describe('in a second document', () => {
    // A same-origin iframe stands in for any second document an app renders
    // layers into through a portal, Document Picture-in-Picture included. A
    // key press reaches only the document it happened in.
    let frame: HTMLIFrameElement;
    let secondDocument: Document;

    beforeEach(() => {
      frame = document.createElement('iframe');
      document.body.appendChild(frame);
      secondDocument = frame.contentDocument!;
    });

    afterEach(() => {
      // Unmount before the frame goes, or React removes nodes from a
      // document that no longer exists.
      cleanup();
      frame.remove();
    });

    it('dismisses the top-most layer of the document the press arrived in', () => {
      const here = vi.fn();
      const there = vi.fn();
      render(<Layer onDismiss={here} />);
      // Registered later, so one order across both documents would put it on
      // top of the layer here as well.
      render(createPortal(<Layer onDismiss={there} />, secondDocument.body));

      fireEvent.keyDown(secondDocument, {key: 'Escape'});
      expect(there).toHaveBeenCalledTimes(1);
      expect(here).not.toHaveBeenCalled();

      pressEscape();
      expect(here).toHaveBeenCalledTimes(1);
      expect(there).toHaveBeenCalledTimes(1);
    });

    it('listens in a document once, and only while it holds a layer', () => {
      const added = vi.spyOn(secondDocument, 'addEventListener');
      const removed = vi.spyOn(secondDocument, 'removeEventListener');
      const keydownCalls = (spy: typeof added) =>
        spy.mock.calls.filter(([type]) => type === 'keydown').length;

      const {unmount} = render(
        createPortal(
          <>
            <Layer onDismiss={vi.fn()} />
            <Layer onDismiss={vi.fn()} />
          </>,
          secondDocument.body,
        ),
      );
      expect(keydownCalls(added)).toBe(1);
      expect(keydownCalls(removed)).toBe(0);

      unmount();
      expect(keydownCalls(removed)).toBe(1);
    });
  });

  it('leaves the event alone when no layer is open', () => {
    // Nothing registered: the browser keeps its own Escape behavior (exiting
    // fullscreen, closing a native picker).
    render(<div />);
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('claims the press it handles so the browser does not act too', () => {
    // preventDefault is what stops the native close-watcher dismissing a second
    // layer behind the stack's back.
    render(<Layer onDismiss={vi.fn()} />);
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
