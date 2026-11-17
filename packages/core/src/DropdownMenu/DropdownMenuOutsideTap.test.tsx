// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuOutsideTap.test.tsx
 * @input An open DropdownMenu above a control, under a coarse primary
 *   pointer. A tap, a pan, a pinch or a mouse press outside the menu, as
 *   pointer, touch and mouse events in jsdom
 * @output Under the touch presentation, a finger's or a pen's touch outside
 *   the open menu reaches nothing beneath. That holds for its pointer, touch
 *   and mouse events and its click, also when the touchstart was not
 *   cancelable. A tap closes
 *   the menu at its lift, and a pan as it begins. The pan and a pinch are not
 *   canceled, and the next touch acts. A mouse press outside and
 *   `presentation="popover"` keep their behavior.
 * @position Unit evidence for DropdownMenu's outside touch, through the
 *   input hold's `'outside'` scope. The browser half is
 *   __tests__/DropdownMenuOutsideTap.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useState} from 'react';
import {DropdownMenu} from './DropdownMenu';
import {DropdownMenuItem} from './DropdownMenuItem';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import {CLICK_GUARD_WINDOW_MS} from '../utils/clickGuard';
import {TOUCH_QUERY} from '../utils/touchPresentation';

interface TouchOptions {
  readonly cancelable?: boolean;
  /** The identifiers of the touches still on the screen after the event. */
  readonly down?: ReadonlyArray<number>;
}

/** A touch event at `target` whose changed touches have `identifiers`. */
function fireTouch(
  target: Element,
  type: 'touchstart' | 'touchmove' | 'touchend',
  identifiers: number | ReadonlyArray<number>,
  {cancelable = true, down}: TouchOptions = {},
): Event {
  const changed = typeof identifiers === 'number' ? [identifiers] : identifiers;
  const event = new Event(type, {bubbles: true, cancelable});
  Object.defineProperty(event, 'changedTouches', {
    value: changed.map(identifier => ({identifier, target})),
  });
  const still = down ?? (type === 'touchend' ? [] : changed);
  Object.defineProperty(event, 'touches', {
    value: still.map(identifier => ({identifier, target})),
  });
  target.dispatchEvent(event);
  return event;
}

function pointer(
  pointerType: 'touch' | 'pen' | 'mouse',
  pointerId: number,
  x = 10,
  y = 10,
) {
  return {pointerType, pointerId, isPrimary: true, clientX: x, clientY: y};
}

/** A finger's tap or a pen's at `target`, up to its lift. */
function tapAt(
  target: Element,
  pointerType: 'touch' | 'pen',
  {id = 9, touchStartCancelable = true} = {},
): void {
  fireEvent.pointerDown(target, pointer(pointerType, id));
  if (pointerType === 'touch') {
    fireTouch(target, 'touchstart', id, {cancelable: touchStartCancelable});
  }
  fireEvent.pointerUp(target, pointer(pointerType, id));
}

/** The browser's click for a touch: only after a touchend nothing canceled. */
function browserClickAfter(touchEnd: Event, target: Element): void {
  if (!touchEnd.defaultPrevented) {
    target.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
    );
  }
}

/** Dispatches mouse events at `target`; returns each one. */
function mouseEvents(
  target: Element,
  types: ReadonlyArray<'mousedown' | 'mouseup' | 'click'>,
): MouseEvent[] {
  return types.map(type => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    target.dispatchEvent(event);
    return event;
  });
}

/**
 * A control that acts on press, as a Switch or a slider thumb does. It logs
 * each event that reaches it.
 */
function PressControl({
  label,
  heard,
}: {
  label: string;
  heard: (type: string) => void;
}) {
  const log = (event: {type: string}) => {
    heard(event.type);
  };
  return (
    <button
      type="button"
      onPointerDown={log}
      onPointerMove={log}
      onPointerUp={log}
      onPointerCancel={log}
      onTouchStart={log}
      onTouchMove={log}
      onTouchEnd={log}
      onMouseDown={log}
      onMouseUp={log}
      onClick={log}>
      {label}
    </button>
  );
}

/** Renders a menu above a press-acting control and opens it. */
async function openMenuOver(presentation?: 'popover') {
  const heard: string[] = [];
  render(
    <>
      <PressControl label="Beneath" heard={type => heard.push(type)} />
      <DropdownMenu button={{label: 'Actions'}} presentation={presentation}>
        <DropdownMenuItem label="Rename" onClick={() => {}} />
        <DropdownMenuItem label="Delete" onClick={() => {}} />
      </DropdownMenu>
    </>,
  );
  const trigger = screen.getByRole('button', {name: /Actions/});
  fireEvent.click(trigger);
  await waitFor(() => {
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
  return {
    heard,
    trigger,
    beneath: screen.getByRole('button', {name: 'Beneath'}),
  };
}

/** A menu whose open state its caller owns. */
function ControlledMenu({
  onOpenChange,
}: {
  onOpenChange: (isOpen: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <DropdownMenu
      button={{label: 'Actions'}}
      isMenuOpen={isOpen}
      onOpenChange={next => {
        onOpenChange(next);
        setIsOpen(next);
      }}>
      <DropdownMenuItem label="Rename" onClick={() => {}} />
    </DropdownMenu>
  );
}

/** A menu whose app shows a scrim only while the menu is open. */
function MenuWithScrim() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      {isOpen ? <div data-testid="scrim" /> : null}
      <DropdownMenu
        button={{label: 'Actions'}}
        isMenuOpen={isOpen}
        onOpenChange={setIsOpen}>
        <DropdownMenuItem label="Rename" onClick={() => {}} />
      </DropdownMenu>
    </>
  );
}

describe('DropdownMenu: a touch outside the open menu (spec:AST-094 FR32)', () => {
  beforeEach(() => {
    __resetMenuPressForTest();
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === TOUCH_QUERY || query === '(pointer: coarse)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    __resetMenuPressForTest();
  });

  it("a finger's tap closes the menu at its lift, and nothing beneath hears it: no pointer, touch or mouse event, and no click", async () => {
    const {heard, trigger, beneath} = await openMenuOver();
    tapAt(beneath, 'touch');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const touchEnd = fireTouch(beneath, 'touchend', 9);
    expect(touchEnd.defaultPrevented).toBe(true);
    browserClickAfter(touchEnd, beneath);
    expect(heard).toEqual([]);
  });

  it('after a touchstart that was not cancelable, the compatibility mouse events and click that follow the canceled touchend reach nothing beneath', async () => {
    const {heard, trigger, beneath} = await openMenuOver();
    vi.useFakeTimers();
    tapAt(beneath, 'touch', {touchStartCancelable: false});
    expect(fireTouch(beneath, 'touchend', 9).defaultPrevented).toBe(true);
    vi.advanceTimersByTime(20);
    const late = mouseEvents(beneath, ['mousedown', 'mouseup', 'click']);
    expect(late.map(event => event.defaultPrevented)).toEqual([
      true,
      true,
      true,
    ]);
    expect(heard).toEqual([]);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it("in a Home Screen web app, WebKit's late click, which names the mouse, reaches nothing beneath", async () => {
    const {heard, beneath} = await openMenuOver();
    vi.useFakeTimers();
    tapAt(beneath, 'touch', {touchStartCancelable: false});
    expect(fireTouch(beneath, 'touchend', 9).defaultPrevented).toBe(true);
    vi.advanceTimersByTime(20);
    const [mouseDown, mouseUp] = mouseEvents(beneath, ['mousedown', 'mouseup']);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    Object.defineProperty(click, 'pointerType', {value: 'mouse'});
    beneath.dispatchEvent(click);
    expect(
      [mouseDown, mouseUp, click].map(event => event.defaultPrevented),
    ).toEqual([true, true, true]);
    expect(heard).toEqual([]);
  });

  it("a mouse's press within the click window keeps its click", async () => {
    const {heard, beneath} = await openMenuOver();
    vi.useFakeTimers();
    tapAt(beneath, 'touch');
    expect(fireTouch(beneath, 'touchend', 9).defaultPrevented).toBe(true);
    vi.advanceTimersByTime(50);
    fireEvent.pointerDown(beneath, pointer('mouse', 1));
    const [mouseDown] = mouseEvents(beneath, ['mousedown']);
    fireEvent.pointerUp(beneath, pointer('mouse', 1));
    const [mouseUp] = mouseEvents(beneath, ['mouseup']);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    Object.defineProperty(click, 'pointerType', {value: 'mouse'});
    beneath.dispatchEvent(click);
    expect(
      [mouseDown, mouseUp, click].map(event => event.defaultPrevented),
    ).toEqual([false, false, false]);
    expect(heard).toEqual([
      'pointerdown',
      'mousedown',
      'pointerup',
      'mouseup',
      'click',
    ]);
  });

  it("a pen's tap closes the menu at its lift, and nothing beneath hears it", async () => {
    const {heard, trigger, beneath} = await openMenuOver();
    tapAt(beneath, 'pen');
    const [mouseUp, click] = mouseEvents(beneath, ['mouseup', 'click']);
    expect(mouseUp.defaultPrevented).toBe(true);
    expect(click.defaultPrevented).toBe(true);
    expect(heard).toEqual([]);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('a pan closes the menu as it begins, and the page keeps it: no touchstart or touchmove is canceled, and nothing beneath hears it', async () => {
    const {heard, trigger, beneath} = await openMenuOver();
    fireEvent.pointerDown(beneath, pointer('touch', 9, 10, 100));
    const touchStart = fireTouch(beneath, 'touchstart', 9);
    fireEvent.pointerMove(beneath, pointer('touch', 9, 10, 95));
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.pointerMove(beneath, pointer('touch', 9, 10, 80));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const touchMove = fireTouch(beneath, 'touchmove', 9);
    fireEvent.pointerCancel(beneath, pointer('touch', 9, 10, 80));
    fireTouch(beneath, 'touchend', 9, {cancelable: false});
    expect(touchStart.defaultPrevented).toBe(false);
    expect(touchMove.defaultPrevented).toBe(false);
    expect(heard).toEqual([]);
  });

  it("a pinch's two fingers are not canceled, so the page still zooms, and nothing beneath hears them", async () => {
    const {heard, beneath} = await openMenuOver();
    fireEvent.pointerDown(beneath, pointer('touch', 9, 10, 100));
    const first = fireTouch(beneath, 'touchstart', 9);
    fireEvent.pointerDown(beneath, {
      ...pointer('touch', 10, 60, 100),
      isPrimary: false,
    });
    const second = fireTouch(beneath, 'touchstart', 10, {down: [9, 10]});
    const pinch = fireTouch(beneath, 'touchmove', [9, 10], {down: [9, 10]});
    fireEvent.pointerCancel(beneath, pointer('touch', 9));
    fireEvent.pointerCancel(beneath, pointer('touch', 10));
    fireTouch(beneath, 'touchend', [9, 10], {cancelable: false});
    expect([first, second, pinch].map(event => event.defaultPrevented)).toEqual(
      [false, false, false],
    );
    expect(heard).toEqual([]);
  });

  it("a mouse's press outside keeps every event and its click", async () => {
    const {heard, beneath} = await openMenuOver();
    fireEvent.pointerDown(beneath, pointer('mouse', 1));
    const [mouseDown] = mouseEvents(beneath, ['mousedown']);
    fireEvent.pointerUp(beneath, pointer('mouse', 1));
    const [mouseUp, click] = mouseEvents(beneath, ['mouseup', 'click']);
    expect(
      [mouseDown, mouseUp, click].map(event => event.defaultPrevented),
    ).toEqual([false, false, false]);
    expect(heard).toEqual([
      'pointerdown',
      'mousedown',
      'pointerup',
      'mouseup',
      'click',
    ]);
  });

  it('with presentation="popover", a finger\'s tap keeps every event and its click (FR25)', async () => {
    const {heard, beneath} = await openMenuOver('popover');
    tapAt(beneath, 'touch');
    const touchEnd = fireTouch(beneath, 'touchend', 9);
    expect(touchEnd.defaultPrevented).toBe(false);
    browserClickAfter(touchEnd, beneath);
    expect(heard).toEqual([
      'pointerdown',
      'touchstart',
      'pointerup',
      'touchend',
      'click',
    ]);
  });

  it('the hold ends with the gesture: the next tap on the control acts, also within the click window', async () => {
    const {heard, trigger, beneath} = await openMenuOver();
    vi.useFakeTimers();
    tapAt(beneath, 'touch');
    expect(fireTouch(beneath, 'touchend', 9).defaultPrevented).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    vi.advanceTimersByTime(50);
    tapAt(beneath, 'touch', {id: 11});
    const soon = fireTouch(beneath, 'touchend', 11);
    expect(soon.defaultPrevented).toBe(false);
    browserClickAfter(soon, beneath);
    vi.advanceTimersByTime(CLICK_GUARD_WINDOW_MS + 100);
    tapAt(beneath, 'touch', {id: 12});
    const later = fireTouch(beneath, 'touchend', 12);
    expect(later.defaultPrevented).toBe(false);
    browserClickAfter(later, beneath);
    const tap = ['pointerdown', 'touchstart', 'pointerup', 'touchend', 'click'];
    expect(heard).toEqual([...tap, ...tap]);
  });

  it("a finger's tap on the trigger is the trigger's own: its touchend is not canceled, and the menu does not close at its lift", async () => {
    const {trigger} = await openMenuOver();
    tapAt(trigger, 'touch');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const touchEnd = fireTouch(trigger, 'touchend', 9);
    expect(touchEnd.defaultPrevented).toBe(false);
  });

  it("a finger's tap on a control in the menu's header is inside: the menu stays open, and the control gets its click", async () => {
    const onFilter = vi.fn();
    render(
      <DropdownMenu
        button={{label: 'Actions'}}
        header={
          <button type="button" onClick={onFilter}>
            Filter
          </button>
        }>
        <DropdownMenuItem label="Rename" onClick={() => {}} />
      </DropdownMenu>,
    );
    const trigger = screen.getByRole('button', {name: /Actions/});
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    const filter = screen.getByRole('button', {name: 'Filter', hidden: true});
    tapAt(filter, 'touch');
    const touchEnd = fireTouch(filter, 'touchend', 9);
    expect(touchEnd.defaultPrevented).toBe(false);
    browserClickAfter(touchEnd, filter);
    expect(onFilter).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it("a controlled menu: a finger's tap outside asks its caller to close it, and nothing beneath hears it", async () => {
    const onOpenChange = vi.fn();
    const heard: string[] = [];
    render(
      <>
        <PressControl label="Beneath" heard={type => heard.push(type)} />
        <ControlledMenu onOpenChange={onOpenChange} />
      </>,
    );
    const trigger = screen.getByRole('button', {name: /Actions/});
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    const beneath = screen.getByRole('button', {name: 'Beneath'});
    tapAt(beneath, 'touch');
    const touchEnd = fireTouch(beneath, 'touchend', 9);
    expect(touchEnd.defaultPrevented).toBe(true);
    browserClickAfter(touchEnd, beneath);
    expect(heard).toEqual([]);
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it("after a menu in the open menu's header closes, a finger's tap outside the open menu still reaches nothing", async () => {
    const heard: string[] = [];
    render(
      <>
        <PressControl label="Beneath" heard={type => heard.push(type)} />
        <DropdownMenu
          button={{label: 'Actions'}}
          header={
            <DropdownMenu button={{label: 'Sort'}}>
              <DropdownMenuItem label="Newest" onClick={() => {}} />
            </DropdownMenu>
          }>
          <DropdownMenuItem label="Rename" onClick={() => {}} />
        </DropdownMenu>
      </>,
    );
    const outer = screen.getByRole('button', {name: /Actions/});
    fireEvent.click(outer);
    await waitFor(() => {
      expect(outer).toHaveAttribute('aria-expanded', 'true');
    });
    const inner = screen.getByRole('button', {name: /Sort/, hidden: true});
    fireEvent.click(inner);
    await waitFor(() => {
      expect(inner).toHaveAttribute('aria-expanded', 'true');
    });
    fireEvent.click(inner);
    await waitFor(() => {
      expect(inner).toHaveAttribute('aria-expanded', 'false');
    });
    expect(outer).toHaveAttribute('aria-expanded', 'true');
    const beneath = screen.getByRole('button', {name: 'Beneath'});
    tapAt(beneath, 'touch');
    const touchEnd = fireTouch(beneath, 'touchend', 9);
    expect(touchEnd.defaultPrevented).toBe(true);
    browserClickAfter(touchEnd, beneath);
    expect(heard).toEqual([]);
    await waitFor(() => {
      expect(outer).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it("a finger's tap on an app's scrim that leaves with the menu ends at its lift: the next tap on the page acts", async () => {
    const heard: string[] = [];
    render(
      <>
        <PressControl label="Beneath" heard={type => heard.push(type)} />
        <MenuWithScrim />
      </>,
    );
    const trigger = screen.getByRole('button', {name: /Actions/});
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
    const scrim = screen.getByTestId('scrim');
    tapAt(scrim, 'touch');
    await waitFor(() => {
      expect(scrim.isConnected).toBe(false);
    });
    // The browser still sends the touchend to the scrim, which has left the
    // page, so no listener on the window hears it.
    fireTouch(scrim, 'touchend', 9);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    vi.useFakeTimers();
    vi.advanceTimersByTime(2000);
    const beneath = screen.getByRole('button', {name: 'Beneath'});
    tapAt(beneath, 'touch', {id: 11});
    const touchEnd = fireTouch(beneath, 'touchend', 11);
    expect(touchEnd.defaultPrevented).toBe(false);
    browserClickAfter(touchEnd, beneath);
    expect(heard).toEqual([
      'pointerdown',
      'touchstart',
      'pointerup',
      'touchend',
      'click',
    ]);
  });

  it('after the browser takes a pan outside, a second finger is a new touch: every one of its events reaches the page', async () => {
    const {heard, trigger, beneath} = await openMenuOver();
    fireEvent.pointerDown(beneath, pointer('touch', 9, 10, 100));
    fireTouch(beneath, 'touchstart', 9);
    fireEvent.pointerMove(beneath, pointer('touch', 9, 10, 80));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // The browser takes the pan, and the first finger still scrolls.
    fireEvent.pointerCancel(beneath, pointer('touch', 9, 10, 80));
    fireTouch(beneath, 'touchmove', 9);
    fireEvent.pointerDown(beneath, pointer('touch', 11));
    fireTouch(beneath, 'touchstart', 11, {down: [9, 11]});
    fireEvent.pointerUp(beneath, pointer('touch', 11));
    const touchEnd = fireTouch(beneath, 'touchend', 11, {down: [9]});
    expect(touchEnd.defaultPrevented).toBe(false);
    browserClickAfter(touchEnd, beneath);
    expect(heard).toEqual([
      'pointerdown',
      'touchstart',
      'pointerup',
      'touchend',
      'click',
    ]);
  });
});
