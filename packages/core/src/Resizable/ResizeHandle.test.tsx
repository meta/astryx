// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ResizeHandle.test.tsx
 * @input Uses vitest, @testing-library/react, useResizable, ResizeHandle
 * @output Unit tests for ResizeHandle keyboard operability and ARIA state
 * @position Testing; validates ResizeHandle.tsx implementation
 *
 * SYNC: When ResizeHandle.tsx changes, update tests to match new behavior
 *
 * These tests guard the WAI-ARIA window-splitter keyboard contract: the
 * keydown handler must live on the focusable `role="separator"` element.
 * Keyboard resizing is pure state math in useResizable (no layout
 * measurement), so the observable effect asserted here is aria-valuenow,
 * which is bound to the region's `_size`.
 */

import {useRef} from 'react';
import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent, act, waitFor} from '@testing-library/react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {ResizeHandle} from './ResizeHandle';
import type {ResizeHandleProps} from './ResizeHandle';
import {useResizable} from './useResizable';
import type {ResizableProps, UseResizableSingleConfig} from './useResizable';

const KEYBOARD_STEP = 10;
const KEYBOARD_LARGE_STEP = 50;

function Harness({
  config,
  handleProps,
}: {
  config?: UseResizableSingleConfig;
  handleProps?: Partial<ResizeHandleProps>;
}) {
  const region = useResizable(
    config ?? {defaultSize: 200, minSize: 100, maxSize: 400},
  );
  return (
    <ResizeHandle resizable={region.props} label="Resize" {...handleProps} />
  );
}

function getSeparator(): HTMLElement {
  return screen.getByRole('separator');
}

function getHitArea(): HTMLElement {
  return getSeparator().firstElementChild as HTMLElement;
}

/** Stub region props, so drag assertions read the calls directly. */
function makeResizable(): ResizableProps {
  return {
    _size: 200,
    _isCollapsed: false,
    _onResizeStart: vi.fn(),
    _onResizeMove: vi.fn(),
    _onResizeEnd: vi.fn(),
    _minSizePx: 100,
    _maxSizePx: 400,
    _snaps: [],
    _collapsedSize: 40,
    _collapsible: false,
    _isResizableProps: true,
  };
}

describe('ResizeHandle', () => {
  // --- ARIA wiring ---

  it('exposes the region size and bounds via ARIA', () => {
    render(<Harness />);
    const separator = getSeparator();
    expect(separator).toHaveAttribute('aria-valuenow', '200');
    expect(separator).toHaveAttribute('aria-valuemin', '100');
    expect(separator).toHaveAttribute('aria-valuemax', '400');
    // Horizontal layout splits along the vertical axis.
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-label', 'Resize');
  });

  it('makes the separator focusable', () => {
    render(<Harness />);
    const separator = getSeparator();
    expect(separator).toHaveAttribute('tabindex', '0');
    act(() => separator.focus());
    expect(separator).toHaveFocus();
  });

  // --- Keyboard resizing (the fix: handler lives on the focused separator) ---

  it('grows the panel by a step on ArrowRight', () => {
    render(<Harness />);
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).toHaveAttribute(
      'aria-valuenow',
      String(200 + KEYBOARD_STEP),
    );
  });

  it('shrinks the panel by a step on ArrowLeft', () => {
    render(<Harness />);
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'ArrowLeft'});
    expect(separator).toHaveAttribute(
      'aria-valuenow',
      String(200 - KEYBOARD_STEP),
    );
  });

  it('uses the large step when Shift is held', () => {
    render(<Harness />);
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'ArrowRight', shiftKey: true});
    expect(separator).toHaveAttribute(
      'aria-valuenow',
      String(200 + KEYBOARD_LARGE_STEP),
    );
  });

  it('jumps to the minimum on Home', () => {
    render(<Harness />);
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'Home'});
    expect(separator).toHaveAttribute('aria-valuenow', '100');
  });

  it('reports the window basis as aria-valuemax when no maximum is configured; End leaves an unbounded region alone', () => {
    const previous = window.innerWidth;
    window.innerWidth = 1000;
    try {
      render(<Harness config={{defaultSize: 200, minSize: 100}} />);
      const separator = getSeparator();
      // ARIA needs a maximum on a separator with a value: the basis the hook
      // resolves against stands in for an unbounded one.
      expect(separator).toHaveAttribute('aria-valuemax', '1000');
      // End still moves only to a configured maximum: the stand-in says how
      // far the pane could reach, not where the handle may safely go
      // (component:Resizable records the End gap).
      act(() => separator.focus());
      fireEvent.keyDown(separator, {key: 'End'});
      expect(separator).toHaveAttribute('aria-valuenow', '200');
    } finally {
      window.innerWidth = previous;
    }
  });

  it('server-renders an unbounded handle with no maximum and reports the window extent after hydration, with no hydration error', async () => {
    const previous = window.innerWidth;
    window.innerWidth = 1000;
    const probe = <Harness config={{defaultSize: 200, minSize: 100}} />;
    const serverHTML = renderToString(probe);
    // The server has no window: no aria-valuemax in the markup.
    expect(serverHTML).not.toContain('aria-valuemax');
    const container = document.createElement('div');
    container.innerHTML = serverHTML;
    document.body.appendChild(container);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot>;
    try {
      await act(async () => {
        root = hydrateRoot(container, probe, {
          onRecoverableError: error => recoverableErrors.push(error),
        });
      });
      // The first client render reads the window through the store and
      // reports it; a render-time window read would mismatch the server
      // markup (or, read only once, leave the attribute missing).
      await waitFor(() =>
        expect(container.querySelector('[role="separator"]')).toHaveAttribute(
          'aria-valuemax',
          '1000',
        ),
      );
      expect(recoverableErrors).toEqual([]);
      expect(
        consoleError.mock.calls.filter(call =>
          String(call[0] ?? '')
            .toLowerCase()
            .includes('hydrat'),
        ),
      ).toEqual([]);
    } finally {
      await act(async () => root!.unmount());
      consoleError.mockRestore();
      container.remove();
      window.innerWidth = previous;
    }
  });

  it('never reports a maximum below the current size, and End does not shrink the region', () => {
    const previous = window.innerWidth;
    window.innerWidth = 500;
    try {
      // A default (or saved, or pre-resize) size larger than the window.
      render(<Harness config={{defaultSize: 800, minSize: 100}} />);
      const separator = getSeparator();
      expect(separator).toHaveAttribute('aria-valuenow', '800');
      expect(separator).toHaveAttribute('aria-valuemax', '800');
      act(() => separator.focus());
      fireEvent.keyDown(separator, {key: 'End'});
      expect(separator).toHaveAttribute('aria-valuenow', '800');
    } finally {
      window.innerWidth = previous;
    }
  });

  it('never reports aria-valuemax below aria-valuemin while collapsed in a small window', () => {
    const previous = window.innerWidth;
    window.innerWidth = 375;
    try {
      render(
        <Harness
          config={{defaultSize: 500, minSize: 400, collapsible: true}}
        />,
      );
      const separator = getSeparator();
      act(() => separator.focus());
      fireEvent.keyDown(separator, {key: 'Enter'});
      expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
      expect(separator).toHaveAttribute('aria-valuemin', '400');
      expect(
        Number(separator.getAttribute('aria-valuemax')),
      ).toBeGreaterThanOrEqual(400);
    } finally {
      window.innerWidth = previous;
    }
  });

  it('reports the window height, not the width, for an unbounded vertical region', () => {
    const previousWidth = window.innerWidth;
    const previousHeight = window.innerHeight;
    window.innerWidth = 1000;
    window.innerHeight = 700;
    try {
      render(
        <Harness
          config={{defaultSize: 200, minSize: 100, direction: 'vertical'}}
          handleProps={{direction: 'vertical'}}
        />,
      );
      const separator = getSeparator();
      expect(separator).toHaveAttribute('aria-valuemax', '700');
    } finally {
      window.innerWidth = previousWidth;
      window.innerHeight = previousHeight;
    }
  });

  it('reports the container basis as aria-valuemax while a percentage bound already observes it', () => {
    function ContainerHarness() {
      const containerRef = useRef<HTMLDivElement>(null);
      const region = useResizable({
        defaultSize: 200,
        minSize: '10%',
        containerRef,
      });
      return (
        <div ref={containerRef}>
          <ResizeHandle resizable={region.props} label="Resize" />
        </div>
      );
    }
    // jsdom has no ResizeObserver; a stub lets the hook subscribe, and the
    // content box is measured through clientWidth minus padding.
    class StubResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(640);
    const computedStyle = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingTop: '0px',
      paddingBottom: '0px',
      paddingLeft: '0px',
      paddingRight: '0px',
    } as unknown as CSSStyleDeclaration);
    try {
      render(<ContainerHarness />);
      expect(getSeparator()).toHaveAttribute('aria-valuemax', '640');
    } finally {
      clientWidth.mockRestore();
      computedStyle.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('reports no aria-valuemax for an unbounded pixel-only region in a container, which stays unobserved', () => {
    function ContainerHarness() {
      const containerRef = useRef<HTMLDivElement>(null);
      const region = useResizable({
        defaultSize: 200,
        minSize: 100,
        containerRef,
      });
      return (
        <div ref={containerRef}>
          <ResizeHandle resizable={region.props} label="Resize" />
        </div>
      );
    }
    render(<ContainerHarness />);
    // component:Resizable Performance: atomic pixel paths add no observer, so
    // the hook never measures this container and reports no stand-in.
    expect(getSeparator()).not.toHaveAttribute('aria-valuemax');
  });

  it('jumps to the maximum on End', () => {
    render(<Harness />);
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'End'});
    expect(separator).toHaveAttribute('aria-valuenow', '400');
  });

  it('resizes along the block axis for a vertical handle', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          direction: 'vertical',
        }}
        handleProps={{direction: 'vertical'}}
      />,
    );
    const separator = getSeparator();
    expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'ArrowDown'});
    expect(separator).toHaveAttribute(
      'aria-valuenow',
      String(200 + KEYBOARD_STEP),
    );
    fireEvent.keyDown(separator, {key: 'ArrowUp'});
    expect(separator).toHaveAttribute('aria-valuenow', '200');
  });

  it('warns when the handle and hook use different axes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Harness
        config={{
          defaultSize: 200,
          direction: 'vertical',
        }}
        handleProps={{direction: 'horizontal'}}
      />,
    );
    expect(warn).toHaveBeenCalledWith(
      'ResizeHandle: direction="horizontal" but its useResizable region is ' +
        '"vertical". They must match: the hook measures one axis and the ' +
        'handle drags the other.',
    );
    warn.mockRestore();
  });

  it('collapses on Enter when the region is collapsible', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          collapsible: true,
        }}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'Enter'});
    // The panel's real size is 0, but aria-valuenow must never drop below
    // aria-valuemin (WCAG 4.1.2) — it clamps to the minimum and the state
    // is announced via aria-valuetext instead.
    expect(separator).toHaveAttribute('aria-valuenow', '100');
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
  });

  it('restores the previous size, not the minimum, when Enter reopens a collapsed pane', () => {
    render(
      <Harness
        config={{
          defaultSize: 300,
          minSize: 100,
          maxSize: 400,
          collapsible: true,
        }}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    expect(separator).toHaveAttribute('aria-valuenow', '300');
    fireEvent.keyDown(separator, {key: 'Enter'});
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
    fireEvent.keyDown(separator, {key: 'Enter'});
    expect(separator).not.toHaveAttribute('aria-valuetext');
    expect(separator).toHaveAttribute('aria-valuenow', '300');
  });

  it('restores the previous size, not the minimum, when a double-click reopens a collapsed pane', () => {
    render(
      <Harness
        config={{
          defaultSize: 300,
          minSize: 100,
          maxSize: 400,
          collapsible: true,
        }}
      />,
    );
    const separator = getSeparator();
    expect(separator).toHaveAttribute('aria-valuenow', '300');
    fireEvent.doubleClick(separator);
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
    fireEvent.doubleClick(separator);
    expect(separator).not.toHaveAttribute('aria-valuetext');
    expect(separator).toHaveAttribute('aria-valuenow', '300');
  });

  it('reopens on a double-click even when the minimum size sits below the collapse threshold', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 20,
          maxSize: 400,
          collapsible: true,
          collapsedSize: 50,
        }}
      />,
    );
    const separator = getSeparator();
    fireEvent.doubleClick(separator);
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
    fireEvent.doubleClick(separator);
    expect(separator).not.toHaveAttribute('aria-valuetext');
    expect(separator).toHaveAttribute('aria-valuenow', '200');
  });

  it('a grow arrow opens a collapsed pane one step above its minimum; the shrink arrow leaves it collapsed', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          collapsible: true,
        }}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'Enter'});
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
    // Shrinking a collapsed pane changes nothing.
    fireEvent.keyDown(separator, {key: 'ArrowLeft'});
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
    // One bare grow step would stay below the collapse threshold (40px) and
    // leave the pane collapsed; instead the arrow opens it one step above the
    // minimum it announced (100 → 110).
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).not.toHaveAttribute('aria-valuetext');
    expect(separator).toHaveAttribute('aria-valuenow', '110');
  });

  it('a grow arrow opens a collapsed pane at its collapsedSize when the minimum sits below it', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 20,
          maxSize: 400,
          collapsible: true,
          collapsedSize: 50,
        }}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'Enter'});
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
    // min + step (30) would still be below the 50px threshold, so the pane
    // opens at the threshold instead.
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).not.toHaveAttribute('aria-valuetext');
    expect(separator).toHaveAttribute('aria-valuenow', '50');
  });

  it('a grow arrow opens a collapsed pane in the reversed layout and under RTL too', () => {
    const rtl = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation(
        () => ({direction: 'rtl'}) as unknown as CSSStyleDeclaration,
      );
    try {
      // Reversed + RTL: the pane sits on the right and grows to the left on
      // screen, which under RTL is ArrowRight again.
      render(
        <Harness
          config={{
            defaultSize: 200,
            minSize: 100,
            maxSize: 400,
            collapsible: true,
          }}
          handleProps={{isReversed: true}}
        />,
      );
      const separator = getSeparator();
      act(() => separator.focus());
      fireEvent.keyDown(separator, {key: 'Enter'});
      expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
      fireEvent.keyDown(separator, {key: 'ArrowLeft'});
      expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
      fireEvent.keyDown(separator, {key: 'ArrowRight'});
      expect(separator).not.toHaveAttribute('aria-valuetext');
      expect(separator).toHaveAttribute('aria-valuenow', '110');
    } finally {
      rtl.mockRestore();
    }
  });

  it('in a reversed layout, ArrowLeft opens a collapsed pane and ArrowRight leaves it collapsed', () => {
    // Reversed: the pane sits on the right and grows to the left.
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          collapsible: true,
        }}
        handleProps={{isReversed: true}}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'Enter'});
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
    fireEvent.keyDown(separator, {key: 'ArrowLeft'});
    expect(separator).not.toHaveAttribute('aria-valuetext');
    expect(separator).toHaveAttribute('aria-valuenow', '110');
  });

  it('under RTL, ArrowLeft opens a collapsed pane and ArrowRight leaves it collapsed', () => {
    const rtl = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation(
        () => ({direction: 'rtl'}) as unknown as CSSStyleDeclaration,
      );
    try {
      // Not reversed, right-to-left: the pane sits on the right and grows
      // toward the left edge of the screen.
      render(
        <Harness
          config={{
            defaultSize: 200,
            minSize: 100,
            maxSize: 400,
            collapsible: true,
          }}
        />,
      );
      const separator = getSeparator();
      act(() => separator.focus());
      fireEvent.keyDown(separator, {key: 'Enter'});
      expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
      fireEvent.keyDown(separator, {key: 'ArrowRight'});
      expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
      fireEvent.keyDown(separator, {key: 'ArrowLeft'});
      expect(separator).not.toHaveAttribute('aria-valuetext');
      expect(separator).toHaveAttribute('aria-valuenow', '110');
    } finally {
      rtl.mockRestore();
    }
  });

  it('with snap points, an arrow moves to the adjacent point in its direction and Shift moves two, clamped to the ends', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          snaps: [100, 200, 300, 400],
        }}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    // A 10px step would snap straight back to 200; the arrow reaches the
    // next point instead.
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).toHaveAttribute('aria-valuenow', '300');
    fireEvent.keyDown(separator, {key: 'ArrowLeft'});
    expect(separator).toHaveAttribute('aria-valuenow', '200');
    fireEvent.keyDown(separator, {key: 'ArrowRight', shiftKey: true});
    expect(separator).toHaveAttribute('aria-valuenow', '400');
    // Already at the last point: the grow arrow changes nothing.
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).toHaveAttribute('aria-valuenow', '400');
    // Shift past the first point clamps to it.
    fireEvent.keyDown(separator, {key: 'ArrowLeft', shiftKey: true});
    expect(separator).toHaveAttribute('aria-valuenow', '200');
    fireEvent.keyDown(separator, {key: 'ArrowLeft', shiftKey: true});
    expect(separator).toHaveAttribute('aria-valuenow', '100');
    fireEvent.keyDown(separator, {key: 'ArrowLeft'});
    expect(separator).toHaveAttribute('aria-valuenow', '100');
  });

  it('with snap points past the bounds, a point beyond maxSize or minSize counts as that bound', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          snaps: [50, 100, 200, 300, 450],
        }}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'End'});
    expect(separator).toHaveAttribute('aria-valuenow', '400');
    fireEvent.keyDown(separator, {key: 'ArrowLeft'});
    expect(separator).toHaveAttribute('aria-valuenow', '300');
    // The 450 point counts as the 400 bound.
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).toHaveAttribute('aria-valuenow', '400');
    fireEvent.keyDown(separator, {key: 'Home'});
    expect(separator).toHaveAttribute('aria-valuenow', '100');
    // The 50 point counts as the 100 bound: nothing below it.
    fireEvent.keyDown(separator, {key: 'ArrowLeft'});
    expect(separator).toHaveAttribute('aria-valuenow', '100');
  });

  it('with snap points, the arrows follow the reversed layout and the reading direction', () => {
    const rtl = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation(
        () => ({direction: 'rtl'}) as unknown as CSSStyleDeclaration,
      );
    try {
      // Reversed under RTL: the two inversions cancel, so ArrowRight grows.
      render(
        <Harness
          config={{
            defaultSize: 200,
            minSize: 100,
            maxSize: 400,
            snaps: [100, 200, 300, 400],
          }}
          handleProps={{isReversed: true}}
        />,
      );
      const separator = getSeparator();
      act(() => separator.focus());
      fireEvent.keyDown(separator, {key: 'ArrowRight'});
      expect(separator).toHaveAttribute('aria-valuenow', '300');
      fireEvent.keyDown(separator, {key: 'ArrowLeft'});
      expect(separator).toHaveAttribute('aria-valuenow', '200');
    } finally {
      rtl.mockRestore();
    }
  });

  it('with snap points in a reversed layout, ArrowLeft moves to the next point and ArrowRight to the previous', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          snaps: [100, 200, 300, 400],
        }}
        handleProps={{isReversed: true}}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'ArrowLeft'});
    expect(separator).toHaveAttribute('aria-valuenow', '300');
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).toHaveAttribute('aria-valuenow', '200');
  });

  it('with snap points, the grow arrow opens a collapsed pane at the snap point nearest one step above its minimum', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          collapsible: true,
          snaps: [100, 200, 300, 400],
        }}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'Enter'});
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
    // min + step is 110; the region can rest only on a point, so it opens
    // on the nearest one (100).
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).not.toHaveAttribute('aria-valuetext');
    expect(separator).toHaveAttribute('aria-valuenow', '100');
    // From there the arrows move between points.
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).toHaveAttribute('aria-valuenow', '200');
  });

  it('a grow arrow opens a hand-built collapsed region one step above its minimum', () => {
    const props: ResizableProps = {
      ...makeResizable(),
      _isCollapsed: true,
      _size: 0,
      _collapsible: true,
    };
    render(<ResizeHandle resizable={props} label="Resize" />);
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    // The same move as the hook's own region: minimum plus one step.
    expect(props._onResizeMove).toHaveBeenCalledWith(props._minSizePx + 10);
  });

  it('reopens on Enter even when the minimum size sits below the collapse threshold', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 20,
          maxSize: 400,
          collapsible: true,
          collapsedSize: 50,
        }}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'Enter'});
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
    fireEvent.keyDown(separator, {key: 'Enter'});
    expect(separator).not.toHaveAttribute('aria-valuetext');
    expect(separator).toHaveAttribute('aria-valuenow', '200');
  });

  it('keeps aria-valuenow >= aria-valuemin and announces "Collapsed" while collapsed', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          collapsible: true,
        }}
      />,
    );
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'Enter'});

    const valueNow = Number(separator.getAttribute('aria-valuenow'));
    const valueMin = Number(separator.getAttribute('aria-valuemin'));
    expect(valueNow).toBeGreaterThanOrEqual(valueMin);
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
  });

  it('removes aria-valuetext when the panel is expanded', () => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          collapsible: true,
        }}
      />,
    );
    const separator = getSeparator();
    expect(separator).not.toHaveAttribute('aria-valuetext');

    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'Enter'}); // collapse
    expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');

    fireEvent.keyDown(separator, {key: 'Enter'}); // expand again
    expect(separator).not.toHaveAttribute('aria-valuetext');
    // Back to the size it had before collapsing, not the minimum.
    expect(separator).toHaveAttribute('aria-valuenow', '200');
  });

  // --- Disabled guard ---

  it('ignores keyboard input when disabled', () => {
    render(<Harness handleProps={{isDisabled: true}} />);
    const separator = getSeparator();
    expect(separator).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(separator).toHaveAttribute('aria-valuenow', '200');
  });

  // --- Drag listener lifecycle ---

  it('takes pointer capture on the grab zone when a drag starts', () => {
    const resizable = makeResizable();
    render(<ResizeHandle resizable={resizable} label="Resize" />);
    const hitArea = getHitArea();
    const setPointerCapture = vi.fn();
    Object.defineProperty(hitArea, 'setPointerCapture', {
      value: setPointerCapture,
      configurable: true,
    });

    fireEvent.pointerDown(hitArea, {pointerId: 7, clientX: 0, clientY: 0});
    // Capture keeps the rest of the gesture on this element, so an embedded
    // frame under the cursor can't swallow the drag into its own document.
    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('drives and ends the drag from events on the grab zone', () => {
    const resizable = makeResizable();
    render(<ResizeHandle resizable={resizable} label="Resize" />);
    const hitArea = getHitArea();

    fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 0, clientY: 0});
    fireEvent.pointerMove(hitArea, {pointerId: 1, clientX: 30, clientY: 0});
    expect(resizable._onResizeMove).toHaveBeenLastCalledWith(30);
    fireEvent.pointerUp(hitArea, {pointerId: 1, clientX: 30, clientY: 0});
    expect(resizable._onResizeEnd).toHaveBeenCalledTimes(1);

    // The drag is over: a later move must not resize anything.
    fireEvent.pointerMove(hitArea, {pointerId: 1, clientX: 90, clientY: 0});
    expect(resizable._onResizeMove).toHaveBeenCalledTimes(1);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('ignores moves from a pointer that does not own the drag', () => {
    const resizable = makeResizable();
    render(<ResizeHandle resizable={resizable} label="Resize" />);
    const hitArea = getHitArea();

    fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 0, clientY: 0});
    fireEvent.pointerMove(hitArea, {pointerId: 2, clientX: 30, clientY: 0});
    expect(resizable._onResizeMove).not.toHaveBeenCalled();
  });

  it.each([
    ['pointercancel', fireEvent.pointerCancel],
    ['lostpointercapture', fireEvent.lostPointerCapture],
  ])('ends the drag on %s without signalling a resize end', (_name, fire) => {
    const resizable = makeResizable();
    render(<ResizeHandle resizable={resizable} label="Resize" />);
    const hitArea = getHitArea();

    fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 0, clientY: 0});
    fire(hitArea, {pointerId: 1});
    expect(resizable._onResizeEnd).not.toHaveBeenCalled();
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');

    fireEvent.pointerMove(hitArea, {pointerId: 1, clientX: 30, clientY: 0});
    expect(resizable._onResizeMove).not.toHaveBeenCalled();
  });

  it.each([
    ['pointercancel', fireEvent.pointerCancel],
    ['lostpointercapture', fireEvent.lostPointerCapture],
  ])('tells the region the gesture is over on %s', (_name, fire) => {
    // A cancelled drag is not a resize end, but it IS the end of the gesture:
    // the region freezes its percentage basis for the duration of a drag, and
    // without this it stays frozen at the container size from grab time.
    const resizable = {...makeResizable(), _onResizeCancel: vi.fn()};
    render(<ResizeHandle resizable={resizable} label="Resize" />);
    const hitArea = getHitArea();

    fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 0, clientY: 0});
    fire(hitArea, {pointerId: 1});
    expect(resizable._onResizeCancel).toHaveBeenCalledTimes(1);
    expect(resizable._onResizeEnd).not.toHaveBeenCalled();
  });

  it('does not report a cancel for a drag that ended normally', () => {
    const resizable = {...makeResizable(), _onResizeCancel: vi.fn()};
    render(<ResizeHandle resizable={resizable} label="Resize" />);
    const hitArea = getHitArea();

    fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 0, clientY: 0});
    fireEvent.pointerUp(hitArea, {pointerId: 1, clientX: 30, clientY: 0});
    expect(resizable._onResizeEnd).toHaveBeenCalledTimes(1);
    // lostpointercapture follows every release; the drag is already cleared.
    fireEvent.lostPointerCapture(hitArea, {pointerId: 1});
    expect(resizable._onResizeCancel).not.toHaveBeenCalled();
  });

  it('tells the region the gesture is over when unmounted mid-drag', () => {
    // The region outlives the handle here, so nothing else would release it.
    const resizable = {...makeResizable(), _onResizeCancel: vi.fn()};
    const {unmount} = render(
      <ResizeHandle resizable={resizable} label="Resize" />,
    );
    fireEvent.pointerDown(getHitArea(), {pointerId: 1, clientX: 0, clientY: 0});
    unmount();
    expect(resizable._onResizeCancel).toHaveBeenCalledTimes(1);
    expect(resizable._onResizeEnd).not.toHaveBeenCalled();
  });

  it('stops driving the region and releases body styles when unmounted mid-drag', () => {
    const resizable = makeResizable();
    const {unmount} = render(
      <ResizeHandle resizable={resizable} label="Resize" />,
    );
    const hitArea = getHitArea();

    // Start a drag and confirm moves reach the region.
    fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 0, clientY: 0});
    expect(resizable._onResizeStart).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(hitArea, {pointerId: 1, clientX: 10, clientY: 0});
    expect(resizable._onResizeMove).toHaveBeenCalledTimes(1);

    // Unmounting removes the capturing element, which implicitly releases the
    // pointer and takes its listeners with it. The body cursor/user-select
    // overrides live outside the element, so they must be released here.
    unmount();
    fireEvent.pointerMove(hitArea, {pointerId: 1, clientX: 50, clientY: 0});
    expect(resizable._onResizeMove).toHaveBeenCalledTimes(1);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('releases body styles and tells the region the gesture is over when its resizable prop goes away mid-drag', () => {
    const resizable = {...makeResizable(), _onResizeCancel: vi.fn()};
    const view = render(<ResizeHandle resizable={resizable} label="Resize" />);
    fireEvent.pointerDown(getHitArea(), {pointerId: 1, clientX: 0, clientY: 0});
    expect(document.body.style.cursor).not.toBe('');
    view.rerender(<ResizeHandle label="Resize" />);
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
    expect(resizable._onResizeCancel).toHaveBeenCalledTimes(1);
    expect(resizable._onResizeEnd).not.toHaveBeenCalled();
  });

  // --- Persistence ---

  it.each([
    ['pointerup', fireEvent.pointerUp],
    ['pointercancel', fireEvent.pointerCancel],
    ['lostpointercapture', fireEvent.lostPointerCapture],
  ])('saves the size once, when a drag ends on %s', (name, finish) => {
    // Every write reaches each other open document of the origin as a
    // `storage` event, so the sizes a drag passes through stay out of
    // storage: only the size it ends on is written.
    const key = `astryx-resizable:drag-${name}`;
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          autoSaveId: `drag-${name}`,
        }}
      />,
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const writes = () => setItem.mock.calls.filter(([k]) => k === key);
    try {
      const hitArea = getHitArea();
      fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 0, clientY: 0});
      for (let x = 1; x <= 30; x++) {
        fireEvent.pointerMove(hitArea, {pointerId: 1, clientX: x, clientY: 0});
      }
      expect(getSeparator()).toHaveAttribute('aria-valuenow', '230');
      expect(writes()).toHaveLength(0);

      finish(hitArea, {pointerId: 1, clientX: 30, clientY: 0});
      expect(writes()).toEqual([
        [key, JSON.stringify({size: 230, isCollapsed: false})],
      ]);
    } finally {
      setItem.mockRestore();
      localStorage.removeItem(key);
    }
  });

  it('saves the dragged size once when the split unmounts mid-drag', () => {
    // The handle's own cleanup ends the gesture, so the size it reached
    // still reaches storage without a per-move write.
    const key = 'astryx-resizable:drag-unmount';
    const {unmount} = render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          autoSaveId: 'drag-unmount',
        }}
      />,
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const writes = () => setItem.mock.calls.filter(([k]) => k === key);
    try {
      const hitArea = getHitArea();
      fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 0, clientY: 0});
      for (let x = 1; x <= 30; x++) {
        fireEvent.pointerMove(hitArea, {pointerId: 1, clientX: x, clientY: 0});
      }
      expect(getSeparator()).toHaveAttribute('aria-valuenow', '230');
      expect(writes()).toHaveLength(0);

      unmount();
      expect(writes()).toEqual([
        [key, JSON.stringify({size: 230, isCollapsed: false})],
      ]);
    } finally {
      setItem.mockRestore();
      localStorage.removeItem(key);
    }
  });

  it('still saves each keyboard step at once', () => {
    const key = 'astryx-resizable:keyboard-steps';
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          autoSaveId: 'keyboard-steps',
        }}
      />,
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      for (let i = 0; i < 3; i++) {
        fireEvent.keyDown(getSeparator(), {key: 'ArrowRight'});
      }
      expect(
        setItem.mock.calls
          .filter(([k]) => k === key)
          .map(([, value]) => (JSON.parse(value) as {size: number}).size),
      ).toEqual([210, 220, 230]);
    } finally {
      setItem.mockRestore();
      localStorage.removeItem(key);
    }
  });

  // --- RTL pointer-drag direction ---

  it('drives the region with the raw pointer delta under LTR', () => {
    const resizable = makeResizable();
    render(<ResizeHandle resizable={resizable} label="Resize" />);
    const hitArea = getHitArea();

    fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 0, clientY: 0});
    // Pointer moves +40px to the right → panel grows by +40 under LTR.
    fireEvent.pointerMove(hitArea, {pointerId: 1, clientX: 40, clientY: 0});
    expect(resizable._onResizeMove).toHaveBeenLastCalledWith(40);
  });

  it('inverts the pointer delta under RTL so dragging resizes intuitively', () => {
    const resizable = makeResizable();
    // Under RTL the start panel sits on the RIGHT, so a pointer move to the
    // right (+clientX) must SHRINK it — the delta is inverted. The handle reads
    // its own computed `direction` via getRTLMultiplier(); jsdom doesn't resolve
    // inherited `direction`, so force it on the separator (the handle element),
    // mirroring the Slider RTL pointer-mapping test precedent.
    render(<ResizeHandle resizable={resizable} label="Resize" />);
    const separator = screen.getByRole('separator');
    const hitArea = separator.firstElementChild as HTMLElement;

    const realGetComputedStyle = window.getComputedStyle;
    const gcsSpy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((el: Element, pseudo?: string | null) => {
        if (el === separator) {
          return {direction: 'rtl'} as CSSStyleDeclaration;
        }
        return realGetComputedStyle(el, pseudo ?? undefined);
      });

    fireEvent.pointerDown(hitArea, {pointerId: 1, clientX: 0, clientY: 0});
    // Same +40px physical move as LTR, but mirrored → −40 delta under RTL.
    fireEvent.pointerMove(hitArea, {pointerId: 1, clientX: 40, clientY: 0});
    expect(resizable._onResizeMove).toHaveBeenLastCalledWith(-40);

    gcsSpy.mockRestore();
  });

  // --- Hit-area geometry (grab zone tracks the visible pill) ---

  it('anchors the biased grab zone with the pill offset and a dir-flipped centering shift', () => {
    // For an off-center pill the hit area must reuse the pill's physical offset
    // construction (anchored at insetInlineStart:0) rather than a divider-
    // relative 50% anchor + percentage bias, so the two stay aligned in LTR and
    // RTL. The half-width-difference centering shift (6.5px) is inline, so it
    // flips physical sign under RTL: `- 6.5px` (LTR) vs `+ 6.5px` (RTL). See the
    // Playwright measurement (hitArea.center === pill.center, 0px offset in both
    // directions) for the geometric proof; here we lock the transform shape.
    render(<Harness handleProps={{pillPlacement: 'start'}} />);
    const hitArea = getSeparator().firstElementChild as HTMLElement;
    expect(hitArea.className).toContain('hitAreaOffsetX');
    const style = hitArea.getAttribute('style') ?? '';
    // LTR (default) branch subtracts the centering shift; RTL branch adds it.
    expect(style).toContain('- 6.5px');
    expect(style).toContain('+ 6.5px');
  });

  it('centers the grab zone on the divider when the pill is centered (no bias)', () => {
    render(<Harness handleProps={{pillPlacement: 'center'}} />);
    const hitArea = getSeparator().firstElementChild as HTMLElement;
    // Centered via the shared rtlStyles.centerInline helper (direction-symmetric
    // left+translateX), not a biased offset.
    expect(hitArea.className).toContain('centerInline');
    expect(hitArea.className).not.toContain('hitAreaOffsetX');
  });

  // The grab zone is stretched along the handle by its 0/0 insets, so anything
  // that moves it across the handle displaces the whole zone off the divider —
  // a percentage does it by half the handle's length, so the taller the panel
  // the larger the dead region, and nothing about it is visible on screen.
  it.each([
    ['horizontal' as const, 'translateX'],
    ['vertical' as const, 'translateY'],
  ])('offsets the %s grab zone along the pill axis only', (direction, axis) => {
    render(
      <Harness
        config={{
          defaultSize: 200,
          minSize: 100,
          maxSize: 400,
          direction,
        }}
        handleProps={{direction, pillPlacement: 'start'}}
      />,
    );
    const hitArea = getSeparator().firstElementChild as HTMLElement;
    const translates = (hitArea.getAttribute('style') ?? '')
      .split(';')
      .map(decl => decl.split(/:(.*)/s)[1]?.trim() ?? '')
      .filter(value => value.startsWith('translate'));

    // Both the LTR and RTL declarations of the horizontal offset.
    expect(translates.length).toBeGreaterThan(0);
    for (const translate of translates) {
      expect(translate.startsWith(`${axis}(`)).toBe(true);
    }
  });

  // --- Prop composition (ordering choice: handler sits after {...props}) ---

  it('runs a consumer onKeyDown alongside keyboard resizing', () => {
    const onKeyDown = vi.fn();
    render(<Harness handleProps={{onKeyDown}} />);
    const separator = getSeparator();
    act(() => separator.focus());
    fireEvent.keyDown(separator, {key: 'ArrowRight'});
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(separator).toHaveAttribute(
      'aria-valuenow',
      String(200 + KEYBOARD_STEP),
    );
  });
});
