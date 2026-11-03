// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useMenuPress.factory.test.tsx
 * @input vitest, @testing-library/react, useMenuPress, createMenuPress
 * @output Tests that useMenuPress is a thin wrapper over createMenuPress. The
 *   ref form creates a factory on the element behind the ref and calls the
 *   latest callbacks. It creates a new factory when an input changes, has none
 *   while the menu is unmounted, and destroys it at unmount. It adds no
 *   listener of its own and server-renders. The options form forwards its
 *   props into the same core (spec:AST-107 FR6, architecture:public-component-api INV22).
 * @position Testing; complements useMenuPress.test.tsx (the behavior, through
 *   the options form) and createMenuPress.test.ts (the factory alone).
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {
  StrictMode,
  Suspense,
  startTransition,
  use,
  useRef,
  useState,
} from 'react';
import {
  MENU_PRESS_MARKER,
  createMenuPress,
  createMenuPressCore,
  type CreateMenuPressReturn,
} from './createMenuPress';
import type * as CreateMenuPressModule from './createMenuPress';
import {__resetMenuPressForTest, useMenuPress} from './useMenuPress';
import {disarmClickGuard} from '../utils/clickGuard';
import {
  __startInteractionModalityTrackingForTest,
  getInteractionModality,
} from '../utils/interactionModality';

// The input-modality listener pair a document gets while it is tracked.
const modalityListeners = (
  calls: ReadonlyArray<readonly [string, ...unknown[]]>,
) =>
  calls
    .map(([type]) => type)
    .filter(type => type === 'keydown' || type === 'pointerdown')
    .sort();

// The real factory and core, wrapped so a test can count and inspect calls.
vi.mock('./createMenuPress', async importOriginal => {
  const actual = await importOriginal<typeof CreateMenuPressModule>();
  return {
    ...actual,
    createMenuPress: vi.fn(actual.createMenuPress),
    createMenuPressCore: vi.fn(actual.createMenuPressCore),
  };
});

const ITEM_SELECTOR = '[role="menuitem"]:not([aria-disabled="true"])';

interface RefHarnessProps {
  onTriggerPress?: () => boolean;
  onSelect?: (label: string) => void;
  isEnabled?: boolean;
}

/** The ref form: no props to spread. */
function RefHarness({onTriggerPress, onSelect, isEnabled}: RefHarnessProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const press = useMenuPress(menuRef, {
    triggerRef,
    itemSelector: ITEM_SELECTOR,
    onTriggerPress,
    isEnabled,
  });
  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => {
          if (press.isTriggerClickFromPress()) {
            onSelect?.('trigger click from the press');
          }
        }}>
        Open
      </button>
      <div ref={menuRef} role="menu" tabIndex={-1} data-testid="menu">
        {['A', 'B'].map(label => (
          <div
            key={label}
            role="menuitem"
            tabIndex={-1}
            onClick={() => onSelect?.(label)}>
            {label}
          </div>
        ))}
      </div>
    </>
  );
}

const touch = (pointerId = 1) => ({pointerType: 'touch', pointerId});
const mouse = (pointerId = 1) => ({pointerType: 'mouse', pointerId, button: 0});
const row = (label: string) => screen.getByRole('menuitem', {name: label});

const restores: (() => void)[] = [];

beforeEach(() => {
  __resetMenuPressForTest();
  vi.mocked(createMenuPress).mockClear();
  vi.mocked(createMenuPressCore).mockClear();
});

afterEach(() => {
  for (const restore of restores.splice(0)) {
    restore();
  }
  disarmClickGuard(document);
});

describe('useMenuPress(menuRef, options) — a thin wrapper over createMenuPress (spec:AST-107 FR6)', () => {
  it('creates one factory on the element behind the ref, with the trigger behind triggerRef, and destroys it at unmount', () => {
    const create = vi.mocked(createMenuPress);
    const {unmount} = render(<RefHarness onTriggerPress={() => true} />);
    expect(create).toHaveBeenCalledTimes(1);
    const [menu, options] = create.mock.calls[0];
    expect(menu).toBe(screen.getByTestId('menu'));
    expect(options.trigger).toBe(screen.getByRole('button', {name: 'Open'}));
    expect(options.itemSelector).toBe(ITEM_SELECTOR);
    const handle = create.mock.results[0].value as CreateMenuPressReturn;
    const destroy = vi.spyOn(handle, 'destroy');
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('behaves as its factory does: a finger’s release picks the row under it', () => {
    const onSelect = vi.fn();
    render(<RefHarness onSelect={onSelect} />);
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerMove(row('B'), touch());
    fireEvent.pointerUp(row('B'), touch());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('calls the latest callbacks without creating a new factory', () => {
    const create = vi.mocked(createMenuPress);
    const first = vi.fn(() => true);
    const next = vi.fn(() => true);
    const {rerender} = render(<RefHarness onTriggerPress={first} />);
    rerender(<RefHarness onTriggerPress={next} />);
    expect(create).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), mouse());
    expect(next).toHaveBeenCalledWith('mouse');
    expect(first).not.toHaveBeenCalled();
  });

  it('keeps calling the committed callbacks while a transition to new ones suspends', async () => {
    const committed = vi.fn(() => true);
    const discarded = vi.fn(() => true);
    const never = new Promise<void>(() => {});
    let swap = () => {};
    function Suspending({next}: {next: boolean}) {
      if (next) {
        use(never);
      }
      return null;
    }
    function Host() {
      const [next, setNext] = useState(false);
      swap = () => startTransition(() => setNext(true));
      return (
        <Suspense fallback={null}>
          <RefHarness onTriggerPress={next ? discarded : committed} />
          <Suspending next={next} />
        </Suspense>
      );
    }
    render(<Host />);
    await act(async () => {
      swap();
    });
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), mouse());
    expect(discarded).not.toHaveBeenCalled();
    expect(committed).toHaveBeenCalledWith('mouse');
  });

  it('passes a value option change to its factory through update(), with no new factory', () => {
    const create = vi.mocked(createMenuPress);
    const onTriggerPress = vi.fn(() => true);
    const {rerender} = render(
      <RefHarness isEnabled onTriggerPress={onTriggerPress} />,
    );
    const first = create.mock.results[0].value as CreateMenuPressReturn;
    const update = vi.spyOn(first, 'update');
    rerender(<RefHarness isEnabled={false} onTriggerPress={onTriggerPress} />);
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({isEnabled: false}),
    );
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), mouse());
    expect(onTriggerPress).not.toHaveBeenCalled();
  });

  it('drops an option the caller stops passing: a dropped onDismiss is not called', () => {
    const first = vi.fn();
    function Dismissable({onDismiss}: {onDismiss?: () => void}) {
      const menuRef = useRef<HTMLDivElement>(null);
      // The options name onDismiss only while it is given, as a caller that
      // builds them conditionally does.
      useMenuPress(
        menuRef,
        onDismiss == null
          ? {itemSelector: ITEM_SELECTOR}
          : {itemSelector: ITEM_SELECTOR, onDismiss},
      );
      return (
        <>
          <button type="button">Outside</button>
          <div ref={menuRef} role="menu">
            <div role="menuitem" tabIndex={-1}>
              A
            </div>
          </div>
        </>
      );
    }
    const {rerender} = render(<Dismissable onDismiss={first} />);
    rerender(<Dismissable />);
    // A mouse pressed in the menu and released outside it, acting on nothing.
    fireEvent.pointerDown(row('A'), mouse());
    fireEvent.pointerUp(screen.getByRole('button', {name: 'Outside'}), mouse());
    expect(first).not.toHaveBeenCalled();
  });

  it('passes a callback given or dropped through update(), with no new factory: the press falls back without one', () => {
    const create = vi.mocked(createMenuPress);
    const onTriggerPress = vi.fn(() => true);
    const {rerender} = render(<RefHarness />);
    rerender(<RefHarness onTriggerPress={onTriggerPress} />);
    expect(create).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), mouse());
    expect(onTriggerPress).toHaveBeenCalledWith('mouse');
  });

  it('moves the press to a new trigger through update(), with no new factory', () => {
    const create = vi.mocked(createMenuPress);
    const onTriggerPress = vi.fn(() => true);
    function TwoTriggers({isSecond}: {isSecond: boolean}) {
      const menuRef = useRef<HTMLDivElement>(null);
      const triggerRef = useRef<HTMLButtonElement>(null);
      useMenuPress(menuRef, {
        triggerRef,
        itemSelector: ITEM_SELECTOR,
        onTriggerPress,
      });
      return (
        <>
          <button type="button" ref={isSecond ? undefined : triggerRef}>
            First
          </button>
          <button type="button" ref={isSecond ? triggerRef : undefined}>
            Second
          </button>
          <div ref={menuRef} role="menu" />
        </>
      );
    }
    const {rerender} = render(<TwoTriggers isSecond={false} />);
    rerender(<TwoTriggers isSecond />);
    expect(create).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'First'}), mouse());
    expect(onTriggerPress).not.toHaveBeenCalled();
    fireEvent.pointerDown(
      screen.getByRole('button', {name: 'Second'}),
      mouse(2),
    );
    expect(onTriggerPress).toHaveBeenCalledWith('mouse');
  });

  it('takes a trigger press once when a handler of the caller\u2019s also forwards it: a press that closes the menu does not open it again', () => {
    // The menu is open, so the press closes it and its gesture ends at once.
    const onTriggerPress = vi.fn(() => false);
    function Forwarding() {
      const menuRef = useRef<HTMLDivElement>(null);
      const triggerRef = useRef<HTMLButtonElement>(null);
      const menuPress = useMenuPress(menuRef, {
        triggerRef,
        itemSelector: ITEM_SELECTOR,
        onTriggerPress,
      });
      return (
        <>
          <button
            type="button"
            ref={triggerRef}
            onPointerDown={menuPress.handleTriggerPointerDown}
            onContextMenu={menuPress.handleTriggerContextMenu}>
            Open
          </button>
          <div ref={menuRef} role="menu">
            <div role="menuitem" tabIndex={-1}>
              A
            </div>
          </div>
        </>
      );
    }
    render(<Forwarding />);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), mouse());
    expect(onTriggerPress).toHaveBeenCalledTimes(1);
  });

  it('has no press, not even on the trigger, while the menu element is unmounted', () => {
    const create = vi.mocked(createMenuPress);
    const onTriggerPress = vi.fn(() => true);
    function MenuWhileOpen({isOpen}: {isOpen: boolean}) {
      const menuRef = useRef<HTMLDivElement>(null);
      const triggerRef = useRef<HTMLButtonElement>(null);
      useMenuPress(menuRef, {
        triggerRef,
        itemSelector: ITEM_SELECTOR,
        onTriggerPress,
      });
      return (
        <>
          <button type="button" ref={triggerRef}>
            Open
          </button>
          {isOpen && <div ref={menuRef} role="menu" />}
        </>
      );
    }
    const {rerender} = render(<MenuWhileOpen isOpen={false} />);
    expect(create).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), mouse());
    expect(onTriggerPress).not.toHaveBeenCalled();
    rerender(<MenuWhileOpen isOpen />);
    expect(create).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Open'}), mouse(2));
    expect(onTriggerPress).toHaveBeenCalledWith('mouse');
  });

  it('returns the factory’s isTriggerClickFromPress and cancel', () => {
    const create = vi.mocked(createMenuPress);
    const onSelect = vi.fn();
    render(<RefHarness onTriggerPress={() => true} onSelect={onSelect} />);
    const handle = create.mock.results[0].value as CreateMenuPressReturn;
    const isFromPress = vi.spyOn(handle, 'isTriggerClickFromPress');
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.pointerDown(trigger, mouse());
    fireEvent.pointerUp(trigger, mouse());
    fireEvent.click(trigger);
    expect(isFromPress).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('trigger click from the press');
  });

  it('follows the element when the ref moves to a new node', () => {
    const create = vi.mocked(createMenuPress);
    function Swapping() {
      const menuRef = useRef<HTMLDivElement>(null);
      const [which, setWhich] = useState<'a' | 'b'>('a');
      useMenuPress(menuRef, {itemSelector: ITEM_SELECTOR});
      return (
        <>
          <button type="button" onClick={() => setWhich('b')}>
            swap
          </button>
          {which === 'a' ? (
            <div key="a" ref={menuRef} role="menu" data-testid="a" />
          ) : (
            <div key="b" ref={menuRef} role="menu" data-testid="b" />
          )}
        </>
      );
    }
    render(<Swapping />);
    const firstHandle = create.mock.results[0].value as CreateMenuPressReturn;
    const destroy = vi.spyOn(firstHandle, 'destroy');
    fireEvent.click(screen.getByRole('button', {name: 'swap'}));
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0]).toBe(screen.getByTestId('b'));
  });

  it('re-creates its factory when the menu moves to another document, so the factory tracks the document the menu is in', () => {
    const create = vi.mocked(createMenuPress);
    const first = document.implementation.createHTMLDocument();
    const second = document.implementation.createHTMLDocument();
    const menu = first.createElement('div');
    first.body.append(menu);
    const menuRef = {current: menu};
    const {rerender, unmount} = renderHook(() =>
      useMenuPress(menuRef, {itemSelector: ITEM_SELECTOR}),
    );
    expect(create).toHaveBeenCalledTimes(1);
    const firstRemove = vi.spyOn(first, 'removeEventListener');
    second.body.append(second.adoptNode(menu));
    rerender();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0]).toBe(menu);
    // The modality pair, and the press-down listener.
    expect(modalityListeners(firstRemove.mock.calls)).toEqual([
      'keydown',
      'pointerdown',
      'pointerdown',
    ]);
    second.dispatchEvent(new Event('pointerdown'));
    expect(getInteractionModality(menu)).toBe('pointer');
    unmount();
  });

  it('adds no listener of its own: with the factory stubbed, rendering and unmounting the hook adds none', () => {
    const stub: CreateMenuPressReturn = {
      isTriggerClickFromPress: () => false,
      cancel: () => {},
      update: () => {},
      handleTriggerPointerDown: () => {},
      handleTriggerContextMenu: () => {},
      destroy: () => {},
    };
    vi.mocked(createMenuPress).mockReturnValueOnce(stub);
    // React's own root listeners go in first, and the page's input-modality
    // pair: the shared utility's, installed once per document at the first
    // consumer's mount.
    __startInteractionModalityTrackingForTest();
    const warmup = document.createElement('div');
    document.body.append(warmup);
    render(<div />, {container: warmup}).unmount();
    warmup.remove();
    let added = 0;
    for (const target of [document, window, EventTarget.prototype]) {
      const add = target.addEventListener;
      target.addEventListener = function (
        this: EventTarget,
        ...args: Parameters<EventTarget['addEventListener']>
      ) {
        added += 1;
        return add.apply(this, args);
      };
      restores.push(() => {
        target.addEventListener = add;
      });
    }
    const holder = document.createElement('div');
    document.body.append(holder);
    const {unmount} = render(<RefHarness />, {container: holder});
    unmount();
    holder.remove();
    // React may add listeners to the new root container; the hook adds none.
    const rootListeners = added;
    added = 0;
    const holder2 = document.createElement('div');
    document.body.append(holder2);
    render(<div />, {container: holder2}).unmount();
    holder2.remove();
    expect(rootListeners).toBe(added);
  });

  it('creates one live factory under StrictMode and destroys every one it created', () => {
    const create = vi.mocked(createMenuPress);
    const real = create.getMockImplementation();
    if (real == null) {
      throw new Error('createMenuPress is not wrapped');
    }
    // Count each handle's destroy from the moment it is created, so the one
    // StrictMode's replayed effect destroys is counted too.
    const destroyed = new Map<CreateMenuPressReturn, number>();
    create.mockImplementation((menu, options) => {
      const handle = real(menu, options);
      const destroy = handle.destroy;
      destroyed.set(handle, 0);
      handle.destroy = () => {
        destroyed.set(handle, (destroyed.get(handle) ?? 0) + 1);
        destroy();
      };
      return handle;
    });
    try {
      const {unmount} = render(
        <StrictMode>
          <RefHarness />
        </StrictMode>,
      );
      expect([...destroyed.values()].filter(count => count === 0)).toHaveLength(
        1,
      );
      unmount();
      expect(destroyed.size).toBeGreaterThanOrEqual(1);
      expect([...destroyed.values()].every(count => count === 1)).toBe(true);
    } finally {
      create.mockImplementation(real);
    }
  });

  it('server-renders without touching the DOM', () => {
    expect(() => renderToString(<RefHarness />)).not.toThrow();
  });
});

describe('useMenuPress(options) — the options form forwards into the same core', () => {
  function OptionsHarness({onSelect}: {onSelect: (label: string) => void}) {
    const menuRef = useRef<HTMLDivElement>(null);
    const press = useMenuPress({menuRef, itemSelector: ITEM_SELECTOR});
    return (
      <div ref={menuRef} role="menu" tabIndex={-1} {...press.menuProps}>
        <div role="menuitem" tabIndex={-1} onClick={() => onSelect('A')}>
          A
        </div>
        <div role="menuitem" tabIndex={-1} onClick={() => onSelect('B')}>
          B
        </div>
      </div>
    );
  }

  it('drives the factory’s core from its spread props, and creates no attached factory', () => {
    const core = vi.mocked(createMenuPressCore);
    const create = vi.mocked(createMenuPress);
    const onSelect = vi.fn();
    render(<OptionsHarness onSelect={onSelect} />);
    expect(core).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    fireEvent.pointerDown(row('A'), touch());
    fireEvent.pointerUp(row('B'), touch());
    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('tracks the document of a menu that mounts later in another document, after every commit, as it does on main', () => {
    const own = document.implementation.createHTMLDocument();
    const addEventListener = vi.spyOn(own, 'addEventListener');
    const removeEventListener = vi.spyOn(own, 'removeEventListener');
    const menuRef: {current: HTMLElement | null} = {current: null};
    const {rerender, unmount} = renderHook(() =>
      useMenuPress({menuRef, itemSelector: ITEM_SELECTOR}),
    );
    const menu = own.createElement('div');
    own.body.append(menu);
    menuRef.current = menu;
    rerender();
    expect(modalityListeners(addEventListener.mock.calls)).toEqual([
      'keydown',
      'pointerdown',
    ]);
    own.dispatchEvent(new Event('pointerdown'));
    expect(getInteractionModality(menu)).toBe('pointer');
    unmount();
    expect(modalityListeners(removeEventListener.mock.calls)).toEqual([
      'keydown',
      'pointerdown',
    ]);
  });

  it('server-renders the menu marker as today', () => {
    const html = renderToString(<OptionsHarness onSelect={() => {}} />);
    expect(html).toContain(`${MENU_PRESS_MARKER}=""`);
  });
});
