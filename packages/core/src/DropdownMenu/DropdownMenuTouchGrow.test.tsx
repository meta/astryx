// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTouchGrow.test.tsx
 * @input DropdownMenu, with the grow's code replaced by a recorder
 * @output Which opens grow the menu out of its trigger. A finger's or a
 *   pen's open grows it, a tap's open at its lift included. A mouse's open,
 *   the keyboard's and a menu pinned to the pointer presentation do not.
 * @position Unit coverage of DropdownMenu's touch grow decision
 *   (useMenuSurfaceMotion.ts). The browser spec covers the frames.
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import {scroll} from '../motion/uikit/scroll';
import {DropdownMenu, type DropdownMenuOption} from './DropdownMenu';
import * as menuSurfaceMotion from './menuSurfaceMotion';
import {
  MENU_GROW_LOAD_WAIT_MS,
  resetMenuSurfaceMotionForTest,
  setMenuSurfaceMotionImportForTest,
} from './useMenuSurfaceMotion';
import {TOUCH_QUERY} from '../utils/touchQueries';

const motion = vi.hoisted(() => ({
  enter: vi.fn(),
  exit: vi.fn(),
  reset: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('./menuSurfaceMotion', () => ({
  createMenuSurfaceMotion: vi.fn(() => motion),
}));
const entranceHold = vi.hoisted(() => vi.fn(() => null));
vi.mock('../Layer/holdEntranceInput', () => ({
  holdEntranceInput: entranceHold,
}));

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

// The grow's code loads on demand: let that load settle.
async function settleLoad() {
  await act(async () => {
    for (let index = 0; index < 5; index++) {
      await Promise.resolve();
    }
  });
}

// jsdom has no popover API: show and hide fire the toggle the layer reads.
beforeEach(() => {
  __resetMenuPressForTest();
  resetMenuSurfaceMotionForTest();
  vi.clearAllMocks();
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
    await settleLoad();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).toHaveBeenCalledTimes(1);
  });

  it('a press that opens the menu grows it, and its close shrinks it back', async () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    fireEvent.pointerDown(trigger, touch);
    await settleLoad();
    expect(motion.enter).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
      key: 'Escape',
    });
    await settleLoad();
    expect(motion.exit).toHaveBeenCalledTimes(1);
  });

  it("a pen's press grows it", async () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Actions'}), pen);
    await settleLoad();
    expect(motion.enter).toHaveBeenCalledTimes(1);
  });

  it("a mouse's open keeps the layer's own entrance", async () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    fireEvent.pointerDown(trigger, mouse);
    fireEvent.pointerUp(trigger, mouse);
    fireEvent.click(trigger, {detail: 1});
    await settleLoad();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("a keyboard open keeps the layer's own entrance, after a finger's earlier press", async () => {
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    // A finger opens and closes it first, so the trigger's last press was a
    // finger's.
    fireEvent.pointerDown(trigger, touch);
    await settleLoad();
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
      key: 'Escape',
    });
    await settleLoad();
    motion.enter.mockClear();
    fireEvent.keyDown(trigger, {key: 'ArrowDown'});
    await settleLoad();
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
    await settleLoad();
    expect(screen.getByRole('menu', {hidden: true})).toBeTruthy();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it("a failed load shows the menu with the layer's own entrance, and the next open loads", async () => {
    let loads = 0;
    setMenuSurfaceMotionImportForTest(async () => {
      loads++;
      if (loads === 1) {
        throw new Error('offline');
      }
      return menuSurfaceMotion;
    });
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    const trigger = screen.getByRole('button', {name: 'Actions'});
    fireEvent.pointerDown(trigger, touch);
    await settleLoad();
    const surface = screen
      .getByRole('menu', {hidden: true})
      .closest<HTMLElement>('[popover] > *');
    expect(surface?.style.getPropertyValue('opacity')).toBe('');
    expect(surface?.style.getPropertyValue('animation-name')).toBe('');
    expect(motion.enter).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
      key: 'Escape',
    });
    await settleLoad();
    fireEvent.pointerDown(trigger, touch);
    await settleLoad();
    expect(loads).toBe(2);
    expect(motion.enter).toHaveBeenCalledTimes(1);
  });

  it("an open that waits longer than an entrance shows the menu with the layer's own entrance, and a late load grows nothing", async () => {
    vi.useFakeTimers();
    let finish: (module: typeof menuSurfaceMotion) => void = () => {};
    setMenuSurfaceMotionImportForTest(
      async () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Actions'}), touch);
    const surface = screen
      .getByRole('menu', {hidden: true})
      .closest<HTMLElement>('[popover] > *');
    expect(surface?.style.getPropertyValue('opacity')).toBe('0');
    // The finger that opened it reaches no row while it is invisible.
    expect(surface?.style.getPropertyValue('pointer-events')).toBe('none');
    const holdsBefore = entranceHold.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(MENU_GROW_LOAD_WAIT_MS);
    });
    expect(surface?.style.getPropertyValue('opacity')).toBe('');
    expect(surface?.style.getPropertyValue('animation-name')).toBe('');
    expect(surface?.style.getPropertyValue('pointer-events')).toBe('');
    // The restored entrance takes input as the layer's own entrance does.
    expect(entranceHold.mock.calls.length).toBe(holdsBefore + 1);
    vi.useRealTimers();
    finish(menuSurfaceMotion);
    await settleLoad();
    expect(motion.enter).not.toHaveBeenCalled();
  });

  it('a close while the open waits ends the wait, and a late load grows nothing', async () => {
    let finish: (module: typeof menuSurfaceMotion) => void = () => {};
    setMenuSurfaceMotionImportForTest(
      async () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Actions'}), touch);
    const surface = screen
      .getByRole('menu', {hidden: true})
      .closest<HTMLElement>('[popover] > *');
    fireEvent.keyDown(screen.getByRole('menu', {hidden: true}), {
      key: 'Escape',
    });
    expect(surface?.style.getPropertyValue('opacity')).toBe('');
    finish(menuSurfaceMotion);
    await settleLoad();
    expect(motion.enter).not.toHaveBeenCalled();
    expect(motion.exit).not.toHaveBeenCalled();
  });

  it("the page's first touch loads the grow's code only where the primary pointer is coarse", async () => {
    let loads = 0;
    setMenuSurfaceMotionImportForTest(async () => {
      loads++;
      return menuSurfaceMotion;
    });
    const {unmount} = render(
      <DropdownMenu button={{label: 'Actions'}} items={ITEMS} />,
    );
    fireEvent.touchStart(document.body);
    await settleLoad();
    expect(loads).toBe(0);
    unmount();
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
    render(<DropdownMenu button={{label: 'Actions'}} items={ITEMS} />);
    fireEvent.touchStart(document.body);
    await settleLoad();
    expect(loads).toBe(1);
  });
});
