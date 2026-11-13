// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTouchGrow.test.tsx
 * @input DropdownMenu, with the grow replaced by a recorder
 * @output Which opens grow the menu out of its trigger. A finger's or a
 *   pen's open grows it, a tap's open at its lift included, and under Reduce
 *   Motion its open and close still play the surface motion. A mouse's open,
 *   the keyboard's and a menu pinned to the pointer presentation do not.
 * @position Unit coverage of DropdownMenu's touch grow decision
 *   (Popover/usePopoverSurfaceMotion.ts). The browser spec
 *   covers the frames.
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import type * as InputHold from '../Layer/inputHold';
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
  createPopoverSurfaceMotion: vi.fn(() => motion),
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

const ITEMS: DropdownMenuOption[] = [{label: 'Edit'}, {label: 'Duplicate'}];

// The trigger's layout box, which a press scales to 0.98 about its centre, as
// Button's press does. Its box read carries that scale unless an override
// takes the transform off.
const TRIGGER_BOX = {left: 141, top: 160, width: 120, height: 44};
function pressScale(trigger: HTMLElement) {
  trigger.style.transform = 'scale(0.98)';
  trigger.getBoundingClientRect = function (this: HTMLElement) {
    const scale =
      this.style.getPropertyValue('transform') === 'none' ? 1 : 0.98;
    const width = TRIGGER_BOX.width * scale;
    const height = TRIGGER_BOX.height * scale;
    const left = TRIGGER_BOX.left + (TRIGGER_BOX.width - width) / 2;
    const top = TRIGGER_BOX.top + (TRIGGER_BOX.height - height) / 2;
    return {
      left,
      top,
      width,
      height,
      x: left,
      y: top,
      right: left + width,
      bottom: top + height,
      toJSON: () => ({}),
    };
  };
}

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

  it("grows from the trigger's box without its press transform (architecture:layer-runtime INV22)", async () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    pressScale(trigger);
    fireEvent.pointerDown(trigger, touch);
    await settle();
    const [[measure]] = motion.enter.mock.calls as unknown as [
      [() => {source: unknown}],
    ];
    expect(measure().source).toEqual(TRIGGER_BOX);
  });

  it("a second finger's tap, a press the press model ignores, keeps the layer's own entrance", async () => {
    render(
      <ScrollView>
        <DropdownMenu button={{label: 'Actions'}} items={ITEMS} />
      </ScrollView>,
    );
    const trigger = screen.getByRole('button', {name: 'Actions'});
    fireEvent.pointerDown(trigger, touch);
    fireEvent.pointerDown(trigger, {...touch, pointerId: 2});
    fireEvent.pointerUp(trigger, {...touch, pointerId: 2});
    fireEvent.click(trigger, {detail: 1});
    await settle();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("a finger's tap that closes a controlled menu leaves the next open from code with the layer's own entrance", async () => {
    const onOpenChange = vi.fn();
    const menu = (isMenuOpen: boolean) => (
      <ScrollView>
        <DropdownMenu
          button={{label: 'Actions'}}
          items={ITEMS}
          isMenuOpen={isMenuOpen}
          onOpenChange={onOpenChange}
        />
      </ScrollView>
    );
    const {rerender} = render(menu(true));
    await settle();
    const trigger = screen.getByRole('button', {name: 'Actions'});
    fireEvent.pointerDown(trigger, touch);
    fireEvent.pointerUp(trigger, touch);
    fireEvent.click(trigger, {detail: 1});
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    rerender(menu(false));
    await settle();
    rerender(menu(true));
    await settle();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("a finger's tap whose light dismiss reaches the layer before its click leaves a later open from code with the layer's own entrance", async () => {
    const onOpenChange = vi.fn();
    const menu = (isMenuOpen: boolean) => (
      <ScrollView>
        <DropdownMenu
          button={{label: 'Actions'}}
          items={ITEMS}
          isMenuOpen={isMenuOpen}
          onOpenChange={onOpenChange}
        />
      </ScrollView>
    );
    const {rerender} = render(menu(true));
    await settle();
    const trigger = screen.getByRole('button', {name: 'Actions'});
    const layer = screen
      .getByRole('menu', {hidden: true})
      .closest<HTMLElement>('[popover]');
    fireEvent.pointerDown(trigger, touch);
    fireEvent.pointerUp(trigger, touch);
    // The browser's light dismiss closes the menu at the lift, before the
    // tap's click, which the layer then refuses as the same press's reopen.
    act(() => {
      layer?.hidePopover();
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    rerender(menu(false));
    fireEvent.click(trigger, {detail: 1});
    await settle();
    // A later press elsewhere, then the app opens the menu from code.
    fireEvent.pointerDown(document.body, touch);
    fireEvent.pointerUp(document.body, touch);
    rerender(menu(true));
    await settle();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("after a refused reopen, an open from code before any other press plays the layer's own entrance", async () => {
    const onOpenChange = vi.fn();
    const menu = (isMenuOpen: boolean) => (
      <ScrollView>
        <DropdownMenu
          button={{label: 'Actions'}}
          items={ITEMS}
          isMenuOpen={isMenuOpen}
          onOpenChange={onOpenChange}
        />
      </ScrollView>
    );
    const {rerender} = render(menu(true));
    await settle();
    const trigger = screen.getByRole('button', {name: 'Actions'});
    const layer = screen
      .getByRole('menu', {hidden: true})
      .closest<HTMLElement>('[popover]');
    fireEvent.pointerDown(trigger, touch);
    fireEvent.pointerUp(trigger, touch);
    act(() => {
      layer?.hidePopover();
    });
    rerender(menu(false));
    fireEvent.click(trigger, {detail: 1});
    await settle();
    // Still the tap's gesture: the app opens the menu from code.
    rerender(menu(true));
    await settle();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("a finger's press on an aria-disabled trigger leaves the next open from code with the layer's own entrance", async () => {
    const menu = (isMenuOpen: boolean) => (
      <DropdownMenu
        button={{label: 'Actions', isDisabled: true}}
        items={ITEMS}
        isMenuOpen={isMenuOpen}
        onOpenChange={() => {}}
      />
    );
    const {rerender} = render(menu(false));
    const trigger = screen.getByRole('button', {name: 'Actions'});
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    fireEvent.pointerDown(trigger, touch);
    fireEvent.pointerUp(trigger, touch);
    fireEvent.click(trigger, {detail: 1});
    await settle();
    rerender(menu(true));
    await settle();
    expect(motion.enter).not.toHaveBeenCalled();
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

  it("under Reduce Motion a finger's open and close still play the surface motion, which leaves the fade to the animator", async () => {
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
    expect(motion.enter).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
      key: 'Escape',
    });
    await settle();
    expect(motion.exit).toHaveBeenCalledTimes(1);
  });

  it("under a theme that reduces motion, a finger's close plays the surface motion's exit too", async () => {
    render(
      <div {...reducedMotionMarkProps(true)}>
        <DropdownMenu button={{label: 'Actions'}} items={ITEMS} />
      </div>,
    );
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Actions'}), touch);
    await settle();
    expect(motion.enter).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
      key: 'Escape',
    });
    await settle();
    expect(motion.exit).toHaveBeenCalledTimes(1);
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
