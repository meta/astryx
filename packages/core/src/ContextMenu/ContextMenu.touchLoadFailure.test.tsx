// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenu.touchLoadFailure.test.tsx
 * @input Uses vitest, Testing Library and ContextMenu, with the touch layer's
 *   import failing until a case lets it load
 * @output Checks a finger on a ContextMenu whose touch layer failed to load:
 *   one development warning, the 500 ms long press and the browser's own
 *   long-press menu open the menu, and the next touch loads the layer again
 * @position Testing; the loaded touch layer is in ContextMenu.test.tsx
 */

import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {contextMenu} from '../motion/uikit/contextMenu';
import {__resetDevWarnings} from '../utils/devWarning';
import {ContextMenu} from './ContextMenu';
import {__resetContextMenuTouchLayerForTest} from './contextMenuTouchLoader';

/** The touch layer's import fails while `attempts` is at most `failUntil`. */
const layerImport = vi.hoisted(() => ({
  attempts: 0,
  failUntil: Number.POSITIVE_INFINITY,
}));

vi.mock('./ContextMenuTouchLayer', async importOriginal => {
  layerImport.attempts += 1;
  if (layerImport.attempts <= layerImport.failUntil) {
    throw new Error('Failed to fetch dynamically imported module');
  }
  return importOriginal();
});

interface Contact {
  id: number;
  x: number;
  y: number;
}

function dispatchTouch(
  type: 'touchstart' | 'touchend',
  target: EventTarget,
  changed: Contact[],
  all: Contact[],
): void {
  const event = new Event(type, {bubbles: true, cancelable: true});
  const toTouch = (contact: Contact) => ({
    identifier: contact.id,
    clientX: contact.x,
    clientY: contact.y,
    target,
  });
  Object.defineProperty(event, 'changedTouches', {value: changed.map(toTouch)});
  Object.defineProperty(event, 'touches', {value: all.map(toTouch)});
  Object.defineProperty(event, 'timeStamp', {value: performance.now()});
  target.dispatchEvent(event);
}

function finger(target: EventTarget) {
  const contact = {id: 1, x: 20, y: 20};
  return {
    down: () => dispatchTouch('touchstart', target, [contact], [contact]),
    up: () => dispatchTouch('touchend', target, [contact], []),
  };
}

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** Runs the page's scheduled load, and what it starts, to its end. */
async function settleLoad(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
}

// The gesture host remembers the latest event time, and each install of fake
// timers restarts the faked clock. So every case moves it past the ones
// before it.
let clockEpoch = 0;

describe('ContextMenu under a finger when its touch layer fails to load', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(pointer: coarse)',
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
      this.setAttribute('popover-open', '');
    });
    HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
      this.removeAttribute('popover-open');
    });
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'Date',
      ],
    });
    clockEpoch += 100_000;
    vi.advanceTimersByTime(clockEpoch);
    __resetContextMenuTouchLayerForTest();
    __resetDevWarnings();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    warn.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderMenu(): HTMLElement {
    render(
      <ContextMenu items={[{label: 'Item 1'}]} data-testid="ctx">
        <div>Long-press me</div>
      </ContextMenu>,
    );
    return screen.getByTestId('ctx');
  }

  it('warns once in development, however many loads fail', async () => {
    const trigger = renderMenu();
    await settleLoad();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('ContextMenu');
    const attempts = layerImport.attempts;
    // The next touch asks again, and that load fails too.
    const press = finger(trigger);
    press.down();
    await settleLoad();
    press.up();
    expect(layerImport.attempts).toBe(attempts + 1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('gives a held finger the 500 ms long press after a failed load', async () => {
    const trigger = renderMenu();
    await settleLoad();
    const press = finger(trigger);
    press.down();
    advance(499);
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    advance(1);
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    press.up();
  });

  it('lets the browser’s own long-press menu open it after a failed load', async () => {
    const trigger = renderMenu();
    await settleLoad();
    const press = finger(trigger);
    press.down();
    advance(300);
    fireEvent(
      trigger,
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      }),
    );
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    press.up();
  });

  // Last: once the layer has loaded, the page keeps it.
  it('loads the layer again at the next touch, and a later finger gets the hold', async () => {
    const trigger = renderMenu();
    await settleLoad();
    // The next load succeeds. The module loads here first, outside the fake
    // timers, so the trigger's new load ends inside this case.
    layerImport.failUntil = layerImport.attempts;
    await import('./ContextMenuTouchLayer');
    const first = finger(trigger);
    first.down();
    await settleLoad();
    first.up();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(contextMenu.press.menuDisplayMs * 2);
    });
    vi.mocked(HTMLElement.prototype.showPopover).mockClear();
    const second = finger(trigger);
    second.down();
    advance(contextMenu.press.menuDisplayMs - 1);
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    advance(1);
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalledTimes(1);
    second.up();
  });
});
