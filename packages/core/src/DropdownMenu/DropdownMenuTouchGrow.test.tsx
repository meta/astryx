// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTouchGrow.test.tsx
 * @input DropdownMenu, with the grow replaced by a recorder
 * @output Which opens grow the menu out of its trigger. A finger's or a
 *   pen's open grows it, a tap's open at its lift included. A mouse's open,
 *   the keyboard's and a menu pinned to the pointer presentation do not.
 * @position Unit coverage of DropdownMenu's touch grow decision
 *   (Popover/usePopoverSurfaceMotion.ts with `rectMorph`). The browser spec
 *   covers the frames.
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import type * as InputHold from '../Layer/inputHold';
import type * as ReducedMotion from '../motion/reducedMotion';
import type * as PopoverSurfaceMotion from '../Popover/popoverSurfaceMotion';
import {scroll} from '../motion/uikit/scroll';
import {DropdownMenu, type DropdownMenuOption} from './DropdownMenu';
import {reducedMotionMarkProps} from '../privateAttributes/reducedMotion.stylex';
import {TOUCH_QUERY} from '../utils/touchQueries';

const motion = vi.hoisted(() => ({
  enter: vi.fn(),
  exit: vi.fn(),
  reset: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../Popover/popoverSurfaceMotion', async importOriginal => ({
  ...(await importOriginal<typeof PopoverSurfaceMotion>()),
  createRectMorphSurfaceMotion: vi.fn(() => motion),
}));
const entranceHold = vi.hoisted(() => vi.fn(() => null));
vi.mock('../Layer/holdEntranceInput', () => ({
  holdEntranceInput: entranceHold,
}));
// Counts the input holds that are up. jsdom hit-tests nothing, so no shield
// is drawn.
const inputHolds = vi.hoisted(() => ({up: 0}));
vi.mock('../Layer/inputHold', async importOriginal => ({
  ...(await importOriginal<typeof InputHold>()),
  holdInput: (_layer: Element, {until}: InputHold.InputHoldOptions) => {
    inputHolds.up += 1;
    let isUp = true;
    const end = () => {
      if (isUp) {
        isUp = false;
        inputHolds.up -= 1;
      }
    };
    const settles = 'finished' in until ? until.finished : until;
    void Promise.resolve(settles).then(end, end);
    return end;
  },
}));
// The one Reduce Motion policy, which a case can turn on by itself, as a new
// theme setting would.
const preference = vi.hoisted(() => ({reduces: false}));
vi.mock('../motion/reducedMotion', async importOriginal => {
  const actual = await importOriginal<typeof ReducedMotion>();
  return {
    ...actual,
    reducedMotionFade: (
      ...args: Parameters<typeof actual.reducedMotionFade>
    ) =>
      preference.reduces
        ? {duration: 200, easing: 'linear'}
        : actual.reducedMotionFade(...args),
  };
});

const ITEMS: DropdownMenuOption[] = [{label: 'Edit'}, {label: 'Duplicate'}];

// A scroll view as the press model's scroll probe reads one.
function ScrollView({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{overflowY: 'auto', height: 100}}
      ref={node => {
        if (node != null) {
          Object.defineProperty(node, 'scrollHeight', {
            configurable: true,
            value: 1000,
          });
          Object.defineProperty(node, 'clientHeight', {
            configurable: true,
            value: 100,
          });
        }
      }}>
      {children}
    </div>
  );
}

const touch = {pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0};
const pen = {
  pointerType: 'pen',
  pointerId: 1,
  button: 0,
  clientX: 0,
  clientY: 0,
};
const mouse = {pointerType: 'mouse', pointerId: 1, button: 0};

// Lets the open's effects and promises settle.
async function settle() {
  await act(async () => {
    for (let index = 0; index < 5; index++) {
      await Promise.resolve();
    }
  });
}

// A touch screen: the primary pointer is coarse.
function stubCoarsePointer() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === TOUCH_QUERY,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

// The page's frames, run by hand: returns what runs the frames asked for.
function stubFrames(): () => Promise<void> {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    frames.push(callback),
  );
  return async () => {
    for (const callback of frames.splice(0)) {
      callback(0);
    }
    await settle();
  };
}

// jsdom has no popover API: show and hide fire the toggle the layer reads.
beforeEach(() => {
  __resetMenuPressForTest();
  vi.clearAllMocks();
  preference.reduces = false;
  inputHolds.up = 0;
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DropdownMenu touch grow', () => {
  it('a tap that opens the menu at its lift, in a scroll view, grows it out of the trigger', async () => {
    vi.useFakeTimers();
    render(
      <ScrollView>
        <DropdownMenu button={{label: 'Actions'}} items={ITEMS} />
      </ScrollView>,
    );
    const trigger = screen.getByRole('button', {name: 'Actions'});
    fireEvent.pointerDown(trigger, touch);
    act(() => {
      vi.advanceTimersByTime(scroll.delaysContentTouchesMs - 60);
    });
    fireEvent.pointerUp(trigger, touch);
    fireEvent.click(trigger, {detail: 1});
    vi.useRealTimers();
    await settle();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).toHaveBeenCalledTimes(1);
  });

  it('a press that opens the menu grows it, and its close shrinks it back', async () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    fireEvent.pointerDown(trigger, touch);
    await settle();
    expect(motion.enter).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
      key: 'Escape',
    });
    await settle();
    expect(motion.exit).toHaveBeenCalledTimes(1);
  });

  it("a finger's first open on a page grows at once, with nothing to wait for", () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Actions'}), touch);
    expect(motion.enter).toHaveBeenCalledTimes(1);
    const surface = screen
      .getByRole('menu', {hidden: true})
      .closest<HTMLElement>('[popover] > *');
    expect(surface?.style.getPropertyValue('opacity')).toBe('');
  });

  it("a pen's press grows it", async () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Actions'}), pen);
    await settle();
    expect(motion.enter).toHaveBeenCalledTimes(1);
  });

  it("a mouse's open keeps the layer's own entrance", async () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    fireEvent.pointerDown(trigger, mouse);
    fireEvent.pointerUp(trigger, mouse);
    fireEvent.click(trigger, {detail: 1});
    await settle();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("a keyboard open keeps the layer's own entrance, after a finger's earlier press", async () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    // A finger opens and closes it first, so the trigger's last press was a
    // finger's.
    fireEvent.pointerDown(trigger, touch);
    await settle();
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
      key: 'Escape',
    });
    await settle();
    motion.enter.mockClear();
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    await settle();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("under Reduce Motion a finger's open keeps the layer's own entrance", async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Actions'}), touch);
    await settle();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("under a theme that reduces motion, a finger's open keeps the layer's own entrance", async () => {
    render(
      <div {...reducedMotionMarkProps(true)}>
        <DropdownMenu button={{label: 'Actions'}} items={ITEMS} />
      </div>,
    );
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Actions'}), touch);
    await settle();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("reads Reduce Motion from reducedMotionFade, the one policy: when it fades, a finger's open keeps the layer's own entrance", async () => {
    preference.reduces = true;
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Actions'}), touch);
    await settle();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it('presentation="popover" keeps the layer\'s own entrance under a finger', async () => {
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        items={ITEMS}
        presentation="popover"
      />,
    );
    const trigger = screen.getByRole('button', {name: 'Actions'});
    fireEvent.pointerDown(trigger, touch);
    fireEvent.pointerUp(trigger, touch);
    fireEvent.click(trigger, {detail: 1});
    await settle();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("keeps taps off the page from a finger's open until the grow's first frame", async () => {
    stubCoarsePointer();
    const runFrames = stubFrames();
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    fireEvent.pointerDown(trigger, touch);
    await settle();
    await runFrames();
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
      key: 'Escape',
    });
    await settle();
    await runFrames();
    expect(inputHolds.up).toBe(0);
    fireEvent.pointerDown(trigger, touch);
    expect(motion.enter).toHaveBeenCalledTimes(2);
    expect(inputHolds.up).toBe(1);
    await runFrames();
    expect(inputHolds.up).toBe(0);
  });
});
