// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTooltip.load.test.tsx
 * @input Uses vitest module mocks and fake timers, useTooltip, Tooltip,
 *   Button, IconButton, Link and TextInput
 * @output Tests that the tooltip's behavior and layer load once per page after
 *   first paint, that no input starts the load, that a hover or keyboard focus
 *   still on the trigger and an open request made before the load are answered
 *   when it lands, and that the trigger names its tooltip only once the
 *   tooltip's layer exists
 * @position Testing; validates the loader and bridge in useTooltip.tsx
 *
 * SYNC: When useTooltip.tsx changes its loader or bridge, update these tests.
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
import {act, fireEvent, render, screen} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import type {ReactElement} from 'react';
import type * as UseTooltipModule from './useTooltip';
import type * as TooltipModule from './Tooltip';

const loads = {
  surface: 0,
  layer: 0,
  failures: 0,
};

function mockLoads() {
  vi.doMock('./tooltipSurface', async importOriginal => {
    loads.surface += 1;
    if (loads.failures > 0) {
      loads.failures -= 1;
      throw new Error('offline');
    }
    return importOriginal();
  });
  vi.doMock('../Layer/useLayer', async importOriginal => {
    loads.layer += 1;
    return importOriginal();
  });
}

const originalMatches = HTMLElement.prototype.matches;
const popoverOpen = new WeakMap<HTMLElement, boolean>();
// jsdom has no hover or focus-visible state. A test turns them on.
let hovered: Element | null = null;
let isFocusVisible = false;

beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpen.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpen.set(this, false);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    this: HTMLElement,
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpen.get(this) ?? false;
    }
    if (selector === ':hover') {
      return hovered != null && this.contains(hovered);
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

let useTooltip: typeof UseTooltipModule.useTooltip;
let pendingTooltipLoad: () => Promise<void> | null;
let Tooltip: typeof TooltipModule.Tooltip;

// Each test imports the tooltip again, so no load from an earlier test (or
// the shared setup's preload) is cached.
beforeEach(async () => {
  vi.resetModules();
  loads.surface = 0;
  loads.layer = 0;
  loads.failures = 0;
  hovered = null;
  isFocusVisible = false;
  mockLoads();
  ({useTooltip, __pendingTooltipLoadForTest: pendingTooltipLoad} =
    await import('./useTooltip'));
  ({Tooltip} = await import('./Tooltip'));
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'performance',
      'Date',
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

const TIP = 'Saves your changes';

function Harness(props: {
  isOpen?: boolean;
  onHide?: () => void;
  onReady?: (tooltip: UseTooltipModule.TooltipReturn) => void;
}): ReactElement {
  const tooltip = useTooltip({isOpen: props.isOpen, onHide: props.onHide});
  props.onReady?.(tooltip);
  return (
    <>
      <button
        type="button"
        ref={tooltip.ref}
        aria-describedby={tooltip.describedBy || undefined}>
        Save
      </button>
      {tooltip.renderTooltip(TIP)}
    </>
  );
}

const trigger = () => screen.getByRole('button', {name: 'Save'});

/** The tooltip layer holding `text`, or null before it loads. */
function layerOf(text = TIP): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('[role="tooltip"]')).find(
      layer => layer.textContent === text,
    ) ?? null
  );
}

function shows(): boolean {
  const layer = layerOf();
  return layer != null && layer.matches(':popover-open');
}

/** Runs the frame, the task after it, and lets the chunk land. */
async function paintAndLoad() {
  await act(async () => {
    vi.advanceTimersToNextFrame();
  });
  await act(async () => {
    vi.advanceTimersByTime(0);
    // An idle callback runs at the latest when its timeout ends.
    vi.advanceTimersByTime(2000);
    await pendingTooltipLoad();
  });
}

describe('the tooltip loads after first paint (architecture:component-import-boundaries DEC-4)', () => {
  it('importing a component that offers a tooltip loads no tooltip layer code', async () => {
    await import('../Button/Button');
    await import('../IconButton/IconButton');
    await import('../Link/Link');
    await import('../TextInput/TextInput');
    expect(loads).toMatchObject({surface: 0, layer: 0});
  });

  it('loads once after first paint, with no input', async () => {
    render(
      <>
        <Harness />
        <Harness />
      </>,
    );
    expect(loads.surface).toBe(0);
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    await paintAndLoad();
    expect(loads.surface).toBe(1);
    expect(screen.getAllByRole('tooltip', {hidden: true})).toHaveLength(2);
  });

  it('no hover, focus or press starts the load before first paint', async () => {
    render(<Harness />);
    fireEvent.pointerEnter(trigger(), {pointerType: 'mouse'});
    fireEvent.mouseEnter(trigger());
    act(() => trigger().focus());
    fireEvent.pointerDown(trigger(), {pointerType: 'touch'});
    fireEvent.click(trigger());
    await act(async () => {
      await Promise.resolve();
    });
    expect(loads.surface).toBe(0);
  });

  it('a hover held through the load shows the tooltip once its delay has passed since the pointer entered', async () => {
    render(<Harness />);
    hovered = trigger();
    fireEvent.pointerEnter(trigger(), {pointerType: 'mouse'});
    fireEvent.mouseEnter(trigger());
    // The load lands more than the 200 ms delay after the entry.
    await paintAndLoad();
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(shows()).toBe(true);
  });

  it('a hover whose entry came before the page could see it waits the whole delay from the load', async () => {
    render(<Harness />);
    hovered = trigger();
    await paintAndLoad();
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(shows()).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(shows()).toBe(true);
  });

  it('a finger tap before the load shows nothing when the load lands, though the browser keeps :hover on the tapped trigger (FR5, FR14)', async () => {
    render(<Harness />);
    // Touch browsers leave the tapped element in :hover after the tap.
    hovered = trigger();
    fireEvent.pointerEnter(trigger(), {pointerType: 'touch'});
    fireEvent.pointerDown(trigger(), {pointerType: 'touch'});
    fireEvent.pointerUp(trigger(), {pointerType: 'touch'});
    await paintAndLoad();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(shows()).toBe(false);
  });

  it('a pointer that left before the load shows nothing until the next hover', async () => {
    render(<Harness />);
    fireEvent.mouseEnter(trigger());
    fireEvent.mouseLeave(trigger());
    await paintAndLoad();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(shows()).toBe(false);
    fireEvent.mouseEnter(trigger());
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(shows()).toBe(true);
  });

  it('keyboard focus still on the trigger when the load lands shows the tooltip at once', async () => {
    render(<Harness />);
    isFocusVisible = true;
    act(() => trigger().focus());
    await paintAndLoad();
    expect(shows()).toBe(true);
  });

  it('focus that left before the load shows nothing', async () => {
    render(<Harness />);
    isFocusVisible = true;
    act(() => trigger().focus());
    act(() => trigger().blur());
    await paintAndLoad();
    expect(shows()).toBe(false);
  });

  it('an open request made before the load opens it once when the load lands', async () => {
    let tooltip: UseTooltipModule.TooltipReturn | null = null;
    render(
      <Harness
        onReady={t => {
          tooltip = t;
        }}
      />,
    );
    act(() => tooltip?.show());
    await paintAndLoad();
    expect(shows()).toBe(true);
  });

  it('a show() followed by a hide() before the load opens nothing', async () => {
    let tooltip: UseTooltipModule.TooltipReturn | null = null;
    render(
      <Harness
        onReady={t => {
          tooltip = t;
        }}
      />,
    );
    act(() => tooltip?.show());
    act(() => tooltip?.hide());
    await paintAndLoad();
    expect(shows()).toBe(false);
  });

  it('a controlled open tooltip shows when the load lands', async () => {
    render(<Harness isOpen />);
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    await paintAndLoad();
    expect(shows()).toBe(true);
  });

  it('a failed load keeps the trigger working, warns once, and a later tooltip loads it again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loads.failures = 1;
    const onClick = vi.fn();
    const {unmount} = render(
      <>
        <Harness />
        <button type="button" onClick={onClick}>
          Other
        </button>
      </>,
    );
    await paintAndLoad();
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Other'}));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    unmount();

    render(<Harness />);
    await paintAndLoad();
    expect(loads.surface).toBe(2);
    expect(layerOf()).not.toBeNull();
    warn.mockRestore();
  });

  it('a show() made before a failed load is dropped and reported through onHide, and a later load does not open it (INV5, INV6)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loads.failures = 1;
    const onHide = vi.fn();
    let tooltip: UseTooltipModule.TooltipReturn | null = null;
    render(
      <Harness
        onHide={onHide}
        onReady={t => {
          tooltip = t;
        }}
      />,
    );
    act(() => tooltip?.show());
    await paintAndLoad();
    expect(onHide).toHaveBeenCalledTimes(1);

    fireEvent.pointerEnter(trigger(), {pointerType: 'mouse'});
    await act(async () => {
      await pendingTooltipLoad();
    });
    expect(loads.surface).toBe(2);
    expect(layerOf()).not.toBeNull();
    expect(shows()).toBe(false);
    warn.mockRestore();
  });

  it('after a failed load, a show() asks for the load again at once and opens when it lands (INV6)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loads.failures = 1;
    let tooltip: UseTooltipModule.TooltipReturn | null = null;
    render(
      <Harness
        onReady={t => {
          tooltip = t;
        }}
      />,
    );
    await paintAndLoad();
    expect(loads.surface).toBe(1);

    act(() => tooltip?.show());
    await act(async () => {
      await pendingTooltipLoad();
    });
    expect(loads.surface).toBe(2);
    expect(shows()).toBe(true);
    warn.mockRestore();
  });

  it('after a failed load, a hover or focus on a mounted trigger asks for the load again at once (INV6)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loads.failures = 1;
    render(<Harness />);
    await paintAndLoad();
    expect(loads.surface).toBe(1);
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();

    fireEvent.pointerEnter(trigger(), {pointerType: 'mouse'});
    await act(async () => {
      await pendingTooltipLoad();
    });
    expect(loads.surface).toBe(2);
    expect(layerOf()).not.toBeNull();
    warn.mockRestore();
  });

  it('the load waits for a trigger to attach: a tooltip whose trigger never attaches starts none', async () => {
    function Detached() {
      const tooltip = useTooltip();
      return <>{tooltip.renderTooltip(TIP)}</>;
    }
    render(<Detached />);
    await paintAndLoad();
    expect(loads.surface).toBe(0);
  });
});

describe('the description reference and the load (architecture:component-import-boundaries INV3)', () => {
  it('before the load the trigger names no element, in server markup and on the client', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Harness />);
    expect(container.querySelector('button')).not.toHaveAttribute(
      'aria-describedby',
    );
    render(<Harness />);
    expect(trigger()).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('tooltip', {hidden: true})).toBeNull();
  });

  it('after the load the trigger names the role="tooltip" layer, which exists', async () => {
    render(<Harness />);
    await paintAndLoad();
    const id = trigger().getAttribute('aria-describedby');
    const tooltip = screen.getByRole('tooltip', {hidden: true});
    expect(id).toBe(tooltip.id);
    expect(tooltip).toHaveTextContent(TIP);
    expect(trigger()).toHaveAccessibleDescription(TIP);
  });

  it('the reference never names a missing element while the layer arrives', async () => {
    render(<Harness />);
    const dangling: string[] = [];
    const observer = new MutationObserver(() => {
      const id = trigger().getAttribute('aria-describedby');
      if (id != null && document.getElementById(id) == null) {
        dangling.push(id);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    await paintAndLoad();
    await act(async () => {
      await Promise.resolve();
    });
    observer.disconnect();
    expect(trigger()).toHaveAttribute('aria-describedby');
    expect(dangling).toEqual([]);
  });

  it('adds no data-* attribute to the trigger at the load', async () => {
    render(<Harness />);
    const dataNames = () =>
      trigger()
        .getAttributeNames()
        .filter(name => name.startsWith('data-'));
    const before = dataNames();
    await paintAndLoad();
    expect(dataNames()).toEqual(before);
  });

  it('the Tooltip component adds no aria-describedby to its child before the load', async () => {
    render(
      <Tooltip content={TIP}>
        <button type="button">Save</button>
      </Tooltip>,
    );
    expect(trigger()).not.toHaveAttribute('aria-describedby');
    await paintAndLoad();
    expect(trigger()).toHaveAccessibleDescription(TIP);
  });
});
