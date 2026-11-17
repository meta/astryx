// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTouchGrowPending.test.tsx
 * @input DropdownMenu, with the grow replaced by a recorder and jsdom's
 *   layout stubbed as useLayer's anchor-readiness tests stub it
 * @output A finger's open that the layer holds until its trigger is a valid
 *   anchor still grows the menu when it opens. That holds for a trigger in a
 *   closed dialog that the page displays. It also holds for a trigger that
 *   gains its box later, even when a key is pressed before the open. Another
 *   press cancels the wait. A keyboard open that waits keeps the layer's own
 *   entrance.
 * @position Unit coverage of DropdownMenu's touch grow decision for an open
 *   that waits; DropdownMenuTouchGrow.test.tsx covers opens that do not wait
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import type * as PopoverSurfaceMotion from '../Popover/popoverSurfaceMotion';
import {DropdownMenu, type DropdownMenuOption} from './DropdownMenu';

const motion = vi.hoisted(() => ({
  enter: vi.fn(),
  exit: vi.fn(),
  reset: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../Popover/popoverSurfaceMotion', async importOriginal => ({
  ...(await importOriginal<typeof PopoverSurfaceMotion>()),
  createPopoverSurfaceMotion: vi.fn(() => motion),
}));
vi.mock('../Layer/holdEntranceInput', () => ({
  holdEntranceInput: vi.fn(() => null),
}));

const ITEMS: DropdownMenuOption[] = [{label: 'Edit'}, {label: 'Duplicate'}];
const touch = {pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0};

describe("DropdownMenu: a finger's open that waits for its trigger", () => {
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
    __resetMenuPressForTest();
    vi.clearAllMocks();
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
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
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
    // jsdom has no popover API: show and hide fire the toggle the layer reads.
    const toggle = (element: HTMLElement, newState: 'open' | 'closed') => {
      const event = new Event('toggle', {bubbles: false});
      Object.defineProperty(event, 'newState', {value: newState});
      element.dispatchEvent(event);
    };
    HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
      this.setAttribute('popover-open', '');
      toggle(this, 'open');
    });
    HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
      this.removeAttribute('popover-open');
      toggle(this, 'closed');
    });
    const matches = HTMLElement.prototype.matches;
    vi.spyOn(HTMLElement.prototype, 'matches').mockImplementation(function (
      this: HTMLElement,
      selector: string,
    ) {
      return selector === ':popover-open'
        ? this.hasAttribute('popover-open')
        : matches.call(this, selector);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  async function settle() {
    await act(async () => {
      for (let index = 0; index < 5; index++) {
        await Promise.resolve();
      }
    });
  }

  /** A trigger with no layout box yet, so the layer holds the open. */
  function renderBoxless() {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    return {
      trigger,
      gainBox: async () => {
        boxes.set(trigger, {width: 80, height: 24});
        act(() => {
          for (const {disconnected, callback} of [...intersections]) {
            if (!disconnected) {
              callback();
            }
          }
        });
        flushFrame();
        flushFrame();
        await settle();
      },
    };
  }

  it("grows a finger's open on a trigger in a closed dialog that the page displays", async () => {
    render(
      <dialog data-testid="dialog">
        <DropdownMenu button={{label: 'Actions'}} items={ITEMS} />
      </dialog>,
    );
    const trigger = screen.getByRole('button', {name: 'Actions', hidden: true});
    boxes.set(trigger, {width: 80, height: 24});
    fireEvent.pointerDown(trigger, touch);
    await settle();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(motion.enter).toHaveBeenCalledTimes(1);
  });

  it("grows a finger's open that waits for the trigger's box", async () => {
    const {trigger, gainBox} = renderBoxless();
    fireEvent.pointerDown(trigger, touch);
    await settle();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(motion.enter).not.toHaveBeenCalled();
    await gainBox();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(motion.enter).toHaveBeenCalledTimes(1);
  });

  it("cancels a finger's open that waits when another press lands before it opens: nothing opens or grows", async () => {
    const {trigger, gainBox} = renderBoxless();
    fireEvent.pointerDown(trigger, touch);
    fireEvent.pointerUp(trigger, touch);
    await settle();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.pointerDown(document.body, {...touch, pointerId: 2});
    fireEvent.pointerUp(document.body, {...touch, pointerId: 2});
    await gainBox();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("grows a finger's open that waits, also when a key is pressed before it opens", async () => {
    const {trigger, gainBox} = renderBoxless();
    fireEvent.pointerDown(trigger, touch);
    fireEvent.pointerUp(trigger, touch);
    await settle();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // A key press starts a new gesture too.
    fireEvent.keyDown(document.body, {key: 'Shift'});
    fireEvent.keyUp(document.body, {key: 'Shift'});
    await gainBox();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(motion.enter).toHaveBeenCalledTimes(1);
  });

  it("keeps the layer's own entrance for a keyboard open that waits, after a finger's earlier press", async () => {
    const {trigger, gainBox} = renderBoxless();
    fireEvent.pointerDown(document.body, touch);
    fireEvent.pointerUp(document.body, touch);
    act(() => {
      trigger.focus();
    });
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    await settle();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await gainBox();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(motion.enter).not.toHaveBeenCalled();
  });
});
