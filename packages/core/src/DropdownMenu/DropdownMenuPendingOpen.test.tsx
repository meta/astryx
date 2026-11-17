// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuPendingOpen.test.tsx
 * @input DropdownMenu, with jsdom's layout stubbed as useLayer's own
 *   anchor-readiness tests stub it
 * @output Proof that an open the layer holds until its trigger is a valid
 *   anchor still focuses the menu and fires `onClick` when it happens
 * @position Unit test beside DropdownMenu.test.tsx; the browser case for a
 *   closed `<dialog>` that the page displays is
 *   `__tests__/DropdownMenuPendingOpen.a11y.browser.spec.ts`
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DropdownMenu} from './DropdownMenu';
import {DropdownMenuItem} from './DropdownMenuItem';

describe('DropdownMenu open that the layer holds until its trigger is an anchor', () => {
  // jsdom has no layout, so the test stubs each piece of one. The stubs are
  // per-element boxes, a manual frame queue and the observers the wait
  // registers. The Web Animations API is stubbed too: its presence marks a
  // real layout environment.
  const boxes = new WeakMap<Element, {width: number; height: number}>();
  let frames: (FrameRequestCallback | null)[] = [];
  let intersections: {disconnected: boolean; callback: () => void}[] = [];
  let animations: unknown[] = [];
  const originalRect = Element.prototype.getBoundingClientRect;
  const originalClientRects = Element.prototype.getClientRects;

  class FakeKeyframeEffect {
    constructor(public target: Element) {}
    getComputedTiming() {
      return {iterations: 1, endTime: 300};
    }
  }

  beforeEach(() => {
    frames = [];
    intersections = [];
    animations = [];
    vi.stubGlobal('KeyframeEffect', FakeKeyframeEffect);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number =>
      frames.push(cb),
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      frames[handle - 1] = null;
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        state: {disconnected: boolean; callback: () => void};
        constructor(callback: () => void) {
          this.state = {disconnected: false, callback};
          intersections.push(this.state);
        }
        observe() {}
        unobserve() {}
        disconnect() {
          this.state.disconnected = true;
        }
      },
    );
    Object.defineProperty(document, 'getAnimations', {
      configurable: true,
      value: () => animations,
    });
    Element.prototype.getBoundingClientRect = function () {
      const box = boxes.get(this) ?? {width: 0, height: 0};
      return {
        ...box,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: box.width,
        bottom: box.height,
        toJSON: () => ({}),
      };
    };
    Element.prototype.getClientRects = function () {
      const box = boxes.get(this);
      const hasBox = box != null && (box.width > 0 || box.height > 0);
      return (hasBox
        ? [this.getBoundingClientRect()]
        : []) as unknown as DOMRectList;
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Element.prototype.getBoundingClientRect = originalRect;
    Element.prototype.getClientRects = originalClientRects;
    delete (document as unknown as {getAnimations?: unknown}).getAnimations;
  });

  /** Runs every queued frame callback once, as one animation frame would. */
  function flushFrame() {
    const pending = frames;
    frames = [];
    act(() => {
      for (const cb of pending) {
        cb?.(performance.now());
      }
    });
  }

  /** Delivers an IntersectionObserver entry, as a trigger gaining a box does. */
  function signal() {
    act(() => {
      for (const {disconnected, callback} of [...intersections]) {
        if (!disconnected) {
          callback();
        }
      }
    });
  }

  /** Starts a running entrance on `element`; the returned call ends it. */
  function startEntrance(element: Element): () => Promise<void> {
    let finish = () => {};
    animations.push({
      effect: new FakeKeyframeEffect(element),
      timeline: document.timeline,
      playState: 'running',
      finished: new Promise<void>(resolve => {
        finish = resolve;
      }),
    });
    return async () => {
      await act(async () => {
        finish();
        await Promise.resolve();
      });
    };
  }

  function renderMenu(onClick: () => void) {
    render(
      <div data-testid="card">
        <DropdownMenu button={{label: 'Actions'}} onClick={onClick}>
          <DropdownMenuItem label="Rename" onClick={() => {}} />
          <DropdownMenuItem label="Delete" onClick={() => {}} />
        </DropdownMenu>
      </div>,
    );
    // The card runs its entrance, so the layer settles before it opens.
    const finishEntrance = startEntrance(screen.getByTestId('card'));
    return {
      trigger: screen.getByRole('button', {name: 'Actions'}),
      finishEntrance,
    };
  }

  it('focuses the menu and fires onClick when a pointer open that waited opens', async () => {
    const onClick = vi.fn();
    const {trigger, finishEntrance} = renderMenu(onClick);

    // The trigger has no box yet, so the layer holds the open. A mouse click
    // reports `detail` 1; a click with 0 is assistive technology's.
    fireEvent.click(trigger, {detail: 1});
    expect(onClick).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // The box arrives while the card still runs its entrance. The layer
    // waits for the entrance, then opens. The menu takes focus a frame later.
    boxes.set(trigger, {width: 80, height: 24});
    signal();
    flushFrame();
    await finishEntrance();
    flushFrame();
    flushFrame();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('menu', {name: 'Actions', hidden: true}),
    ).toHaveFocus();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('opens a controlled menu whose parent renders again while the open waits', async () => {
    const onClick = vi.fn();
    function ControlledMenu({tick}: {tick: number}) {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div data-testid="card" data-tick={tick}>
          <DropdownMenu
            button={{label: 'Actions'}}
            isMenuOpen={isOpen}
            onOpenChange={setIsOpen}
            onClick={onClick}>
            <DropdownMenuItem label="Rename" onClick={() => {}} />
          </DropdownMenu>
        </div>
      );
    }
    const {rerender} = render(<ControlledMenu tick={0} />);
    const finishEntrance = startEntrance(screen.getByTestId('card'));
    const trigger = screen.getByRole('button', {name: 'Actions'});

    fireEvent.click(trigger, {detail: 1});
    // The controller hears of the open only when it happens. A render before
    // then must not cancel it.
    rerender(<ControlledMenu tick={1} />);
    boxes.set(trigger, {width: 80, height: 24});
    signal();
    flushFrame();
    await finishEntrance();
    flushFrame();
    flushFrame();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('menu', {name: 'Actions', hidden: true}),
    ).toHaveFocus();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('lands a keyboard open that waited on the first row, and ArrowUp on the last', async () => {
    const {trigger, finishEntrance} = renderMenu(() => {});
    act(() => {
      trigger.focus();
    });

    fireEvent.keyDown(trigger, {key: 'ArrowUp'});
    boxes.set(trigger, {width: 80, height: 24});
    signal();
    flushFrame();
    await finishEntrance();
    flushFrame();
    flushFrame();

    expect(
      screen.getByRole('menuitem', {name: 'Delete', hidden: true}),
    ).toHaveFocus();
  });
});
