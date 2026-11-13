// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.tooltipLoad.test.tsx
 * @input Uses vitest, @testing-library/react, Button, IconButton
 * @output Tests that Button and IconButton load the tooltip layer code only
 *   on the first intent on a Button with `tooltip`, describe the Button
 *   before that load, and answer an intent made during the load once
 * @position Testing; validates Button's use of hooks/useDeferredTooltip.tsx
 *
 * SYNC: When Button.tsx or hooks/useDeferredTooltip.tsx changes, update these
 * tests.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import type * as ButtonModule from './Button';
import type * as IconButtonModule from '../IconButton/IconButton';

const loads = {
  layer: 0,
  tooltip: 0,
  surface: 0,
  gate: null as Promise<void> | null,
  failures: 0,
};

/** Counts each load of a module, so a test sees what an import brought. */
function mockLoads() {
  vi.doMock('../Layer/useLayer', async importOriginal => {
    loads.layer += 1;
    return importOriginal();
  });
  vi.doMock('../Tooltip/useTooltip', async importOriginal => {
    loads.tooltip += 1;
    return importOriginal();
  });
  vi.doMock('../Tooltip/DeferredTooltip', async importOriginal => {
    loads.surface += 1;
    if (loads.gate != null) {
      await loads.gate;
    }
    if (loads.failures > 0) {
      loads.failures -= 1;
      throw new Error('offline');
    }
    return importOriginal();
  });
}

const originalMatches = HTMLElement.prototype.matches;
const popoverOpenState = new WeakMap<HTMLElement, boolean>();
// jsdom does not match `:focus-visible`. A keyboard focus test turns it on.
let isFocusVisible = false;

beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    this: HTMLElement,
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    if (selector === ':focus-visible') {
      return isFocusVisible && this === this.ownerDocument.activeElement;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
});

let Button: typeof ButtonModule.Button;
let IconButton: typeof IconButtonModule.IconButton;

// Each test imports Button again, so no load from an earlier test is cached.
beforeEach(async () => {
  vi.resetModules();
  mockLoads();
  loads.layer = 0;
  loads.tooltip = 0;
  loads.surface = 0;
  loads.gate = null;
  loads.failures = 0;
  isFocusVisible = false;
  ({Button} = await import('./Button'));
  ({IconButton} = await import('../IconButton/IconButton'));
  // The held hover's start comes from `performance.now()`, so the fake clock
  // drives it too.
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'Date',
      'performance',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const TIP = 'Save your changes';

function shows(text = TIP): boolean {
  const layer = screen
    .queryByRole('tooltip', {hidden: true})
    ?.closest<HTMLElement>('[popover]');
  return (
    layer != null &&
    layer.textContent === text &&
    layer.matches(':popover-open')
  );
}

/** Holds the tooltip module's load until the returned function runs. */
function holdLoad(): () => void {
  let release: () => void = () => {};
  loads.gate = new Promise(resolve => {
    release = resolve;
  });
  return release;
}

/** Lets a started load finish and its surface mount. */
async function settleLoad() {
  await act(async () => {
    await vi.dynamicImportSettled();
    if (loads.surface > 0) {
      // Waits for the same module evaluation as the hook's own import.
      await import('../Tooltip/DeferredTooltip').catch(() => {});
    }
    // The loader hands the module to the hook a few promise steps later.
    for (let step = 0; step < 20; step += 1) {
      await Promise.resolve();
    }
    vi.advanceTimersByTime(0);
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function hover(element: HTMLElement) {
  fireEvent.pointerEnter(element, {pointerType: 'mouse'});
  fireEvent.mouseEnter(element);
}

function unhover(element: HTMLElement) {
  fireEvent.pointerLeave(element, {pointerType: 'mouse'});
  fireEvent.mouseLeave(element, {relatedTarget: document.body});
}

/** A finger tap: the press, its release, then the browser's `click`. */
function tap(element: HTMLElement) {
  fireEvent.pointerDown(element, {pointerType: 'touch'});
  fireEvent.pointerUp(element, {pointerType: 'touch'});
  fireEvent.click(element, {detail: 1});
}

describe('Button tooltip layer load (architecture:component-import-boundaries INV1–INV6)', () => {
  it('a Button without a tooltip loads no tooltip or layer code, whatever the person does', async () => {
    const onClick = vi.fn();
    render(<Button label="Save" onClick={onClick} />);
    const button = screen.getByRole('button', {name: 'Save'});
    hover(button);
    act(() => button.focus());
    tap(button);
    fireEvent.pointerDown(button, {pointerType: 'mouse'});
    fireEvent.click(button);
    await settleLoad();
    advance(1000);

    expect(onClick).toHaveBeenCalled();
    expect(loads).toMatchObject({tooltip: 0, layer: 0, surface: 0});
  });

  it('an IconButton without a tooltip loads no tooltip or layer code', async () => {
    render(<IconButton label="Settings" icon={<span>g</span>} />);
    const button = screen.getByRole('button', {name: 'Settings'});
    hover(button);
    act(() => button.focus());
    await settleLoad();

    expect(loads).toMatchObject({tooltip: 0, layer: 0, surface: 0});
  });

  it('a Button with a tooltip loads nothing until an intent', async () => {
    render(<Button label="Save" tooltip={TIP} />);
    await settleLoad();
    advance(1000);

    expect(loads).toMatchObject({tooltip: 0, layer: 0, surface: 0});
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
  });

  it('server markup describes the Button by text that is in that markup', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Button label="Save" tooltip={TIP} />);
    document.body.append(container);
    try {
      const button = container.querySelector('button')!;
      const ids = button.getAttribute('aria-describedby')!.split(' ');
      expect(ids).toHaveLength(1);
      expect(container.ownerDocument.getElementById(ids[0])).toHaveTextContent(
        TIP,
      );
      expect(button).toHaveAccessibleDescription(TIP);
      expect(button).toHaveAccessibleName('Save');
    } finally {
      container.remove();
    }
  });

  it('the description stays the same when the tooltip loads', async () => {
    render(<Button label="Save" tooltip={TIP} aria-describedby="hint" />);
    const button = screen.getByRole('button', {name: 'Save'});
    const before = button.getAttribute('aria-describedby');
    expect(before).toMatch(/^hint /);

    hover(button);
    await settleLoad();
    advance(200);

    expect(shows()).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe(before);
    expect(button).toHaveAccessibleName('Save');
  });

  it('a hover during the load shows the tooltip when the delay from the entry ends, not later', async () => {
    const release = holdLoad();
    render(<Button label="Save" tooltip={TIP} />);
    const button = screen.getByRole('button', {name: 'Save'});

    hover(button);
    advance(150);
    release();
    await settleLoad();
    advance(49);
    expect(shows()).toBe(false);
    advance(1);
    expect(shows()).toBe(true);
  });

  it('a hover that outlasts the load shows the tooltip at once when the module loads', async () => {
    const release = holdLoad();
    render(<Button label="Save" tooltip={TIP} />);
    const button = screen.getByRole('button', {name: 'Save'});

    hover(button);
    advance(500);
    release();
    await settleLoad();
    advance(0);
    expect(shows()).toBe(true);
  });

  it('a hover that leaves during the load shows nothing', async () => {
    const release = holdLoad();
    render(<Button label="Save" tooltip={TIP} />);
    const button = screen.getByRole('button', {name: 'Save'});

    hover(button);
    unhover(button);
    release();
    await settleLoad();
    advance(1000);
    expect(shows()).toBe(false);
  });

  it('a mouse press during the load cancels the held hover', async () => {
    const release = holdLoad();
    render(<Button label="Save" tooltip={TIP} />);
    const button = screen.getByRole('button', {name: 'Save'});

    hover(button);
    fireEvent.pointerDown(button, {pointerType: 'mouse'});
    release();
    await settleLoad();
    advance(1000);
    expect(shows()).toBe(false);
  });

  it('keyboard focus during the load shows the tooltip once it loads', async () => {
    const release = holdLoad();
    render(<Button label="Save" tooltip={TIP} />);
    const button = screen.getByRole('button', {name: 'Save'});

    isFocusVisible = true;
    act(() => button.focus());
    release();
    await settleLoad();
    expect(shows()).toBe(true);
  });

  it('focus that leaves during the load shows nothing', async () => {
    const release = holdLoad();
    render(<Button label="Save" tooltip={TIP} />);
    const button = screen.getByRole('button', {name: 'Save'});

    isFocusVisible = true;
    act(() => button.focus());
    act(() => button.blur());
    release();
    await settleLoad();
    advance(1000);
    expect(shows()).toBe(false);
  });

  it('a tap during the load on a disabled Button opens its reason once it loads', async () => {
    const release = holdLoad();
    render(<Button label="Save" tooltip={TIP} isDisabled />);
    const button = screen.getByRole('button', {name: 'Save'});

    tap(button);
    release();
    await settleLoad();
    expect(shows()).toBe(true);

    // The replayed tap arms the outside dismissal, as a tap does.
    fireEvent.pointerDown(document.body, {pointerType: 'touch'});
    fireEvent.pointerUp(document.body, {pointerType: 'touch'});
    expect(shows()).toBe(false);
  });

  it('a tap on an enabled Button keeps its action and opens no tooltip', async () => {
    const onClick = vi.fn();
    render(<Button label="Save" tooltip={TIP} onClick={onClick} />);
    const button = screen.getByRole('button', {name: 'Save'});

    tap(button);
    await settleLoad();
    advance(1000);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(shows()).toBe(false);
  });

  it('a touch press that becomes a scroll opens nothing', async () => {
    render(<Button label="Save" tooltip={TIP} isDisabled />);
    const button = screen.getByRole('button', {name: 'Save'});

    fireEvent.pointerDown(button, {pointerType: 'touch'});
    fireEvent.pointerCancel(button, {pointerType: 'touch'});
    await settleLoad();
    advance(1000);
    expect(shows()).toBe(false);
  });

  it('a failed load keeps the Button working, drops the intent, and the next intent loads again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loads.failures = 1;
    const onClick = vi.fn();
    render(<Button label="Save" tooltip={TIP} onClick={onClick} />);
    const button = screen.getByRole('button', {name: 'Save'});

    hover(button);
    await settleLoad();
    advance(1000);
    expect(shows()).toBe(false);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);

    unhover(button);
    hover(button);
    await settleLoad();
    advance(200);
    expect(shows()).toBe(true);
    warn.mockRestore();
  });

  it('a link Button that becomes disabled keeps its tooltip on the new element', async () => {
    const {rerender} = render(
      <Button label="Docs" href="https://example.com" tooltip={TIP} />,
    );
    hover(screen.getByRole('link', {name: 'Docs'}));
    await settleLoad();
    advance(200);
    expect(shows()).toBe(true);

    rerender(
      <Button
        label="Docs"
        href="https://example.com"
        tooltip={TIP}
        isDisabled
      />,
    );
    const button = screen.getByRole('button', {name: 'Docs'});
    unhover(button);
    advance(1000);
    expect(shows()).toBe(false);
    hover(button);
    advance(200);
    expect(shows()).toBe(true);
  });

  it('an IconButton with a tooltip loads it on hover and shows it', async () => {
    render(
      <IconButton label="Bell" icon={<span>b</span>} tooltip="Notifications" />,
    );
    const button = screen.getByRole('button', {name: 'Bell'});
    expect(button).toHaveAccessibleDescription('Notifications');
    expect(loads.surface).toBe(0);

    hover(button);
    await settleLoad();
    advance(200);
    expect(shows('Notifications')).toBe(true);
    expect(button).toHaveAccessibleDescription('Notifications');
  });
});
