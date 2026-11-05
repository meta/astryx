// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act, fireEvent} from '@testing-library/react';
import {ThreeDChart} from './ThreeDChart';
import {use3D} from './ThreeDContext';

const data = [
  {x: 0, y: 0, z: 0},
  {x: 10, y: 20, z: 30},
];

/** Renders the current camera angles so tests can observe rotation. */
function CameraProbe() {
  const {camera} = use3D();
  return (
    <>
      <text data-testid="azimuth">{camera.azimuth}</text>
      <text data-testid="elevation">{camera.elevation}</text>
    </>
  );
}

function azimuth(): number {
  return Number(screen.getByTestId('azimuth').textContent);
}

function elevation(): number {
  return Number(screen.getByTestId('elevation').textContent);
}

// Capture the ResizeObserver callback so tests can drive the reported width.
let resizeCallback: ResizeObserverCallback | undefined;

// Manual rAF queue: callbacks are collected and only run when the test
// flushes them, so we can observe whether the rotation loop is scheduled.
let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;
let cancelSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resizeCallback = undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );

  rafCallbacks = new Map();
  nextRafId = 0;
  cancelSpy = vi.fn((id: number) => {
    rafCallbacks.delete(id);
  });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    nextRafId += 1;
    rafCallbacks.set(nextRafId, cb);
    return nextRafId;
  });
  vi.stubGlobal('cancelAnimationFrame', cancelSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function reportWidth(width: number) {
  act(() => {
    resizeCallback?.(
      [{contentRect: {width}} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

function flushFrame(now: number) {
  const callbacks = [...rafCallbacks.values()];
  rafCallbacks.clear();
  act(() => {
    callbacks.forEach(cb => cb(now));
  });
}

/** matchMedia stub where prefers-reduced-motion: reduce matches. */
function stubReducedMotion() {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    return {
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  });
}

function renderChart(props: Partial<Parameters<typeof ThreeDChart>[0]> = {}) {
  const result = render(
    <ThreeDChart data={data} xKey="x" yKey="y" zKey="z" {...props}>
      <CameraProbe />
    </ThreeDChart>,
  );
  reportWidth(600);
  return result;
}

describe('ThreeDChart accessible name', () => {
  it('exposes role="img" with a default label derived from the data keys', () => {
    renderChart();
    expect(
      screen.getByRole('img', {name: '3D chart of y by x and z'}),
    ).toBeInTheDocument();
  });

  it('uses the label prop when provided', () => {
    renderChart({label: 'Revenue by region and quarter'});
    expect(
      screen.getByRole('img', {name: 'Revenue by region and quarter'}),
    ).toBeInTheDocument();
  });

  it('is not a tab stop when static (no interaction, no rotation)', () => {
    renderChart();
    expect(screen.getByRole('img')).not.toHaveAttribute('tabindex');
  });
});

describe('ThreeDChart auto-rotation', () => {
  it('rotates the camera when autoRotate is set', () => {
    renderChart({autoRotate: 1});
    expect(rafCallbacks.size).toBe(1);
    flushFrame(100);
    expect(azimuth()).toBeGreaterThan(35);
  });

  it('does not start the rotation loop under prefers-reduced-motion', () => {
    stubReducedMotion();
    renderChart({autoRotate: 1});
    expect(rafCallbacks.size).toBe(0);
    expect(azimuth()).toBe(35);
  });

  it('pauses rotation while hovered and resumes on leave', () => {
    renderChart({autoRotate: 1});
    expect(rafCallbacks.size).toBe(1);

    fireEvent.mouseOver(screen.getByRole('img'));
    expect(cancelSpy).toHaveBeenCalled();
    expect(rafCallbacks.size).toBe(0);

    const before = azimuth();
    flushFrame(200);
    expect(azimuth()).toBe(before);

    fireEvent.mouseOut(screen.getByRole('img'));
    expect(rafCallbacks.size).toBe(1);
  });

  it('pauses rotation while focused and resumes on blur', () => {
    renderChart({autoRotate: 1});
    expect(rafCallbacks.size).toBe(1);

    fireEvent.focus(screen.getByRole('img'));
    expect(cancelSpy).toHaveBeenCalled();
    expect(rafCallbacks.size).toBe(0);

    fireEvent.blur(screen.getByRole('img'));
    expect(rafCallbacks.size).toBe(1);
  });

  it('is focusable when auto-rotating so keyboard users can pause it', () => {
    renderChart({autoRotate: 1});
    expect(screen.getByRole('img')).toHaveAttribute('tabindex', '0');
  });
});

describe('ThreeDChart keyboard camera', () => {
  it('is focusable when interactive', () => {
    renderChart({interactive: true});
    expect(screen.getByRole('img')).toHaveAttribute('tabindex', '0');
  });

  it('rotates yaw with ArrowLeft/ArrowRight', () => {
    renderChart({interactive: true});
    const svg = screen.getByRole('img');

    fireEvent.keyDown(svg, {key: 'ArrowRight'});
    expect(azimuth()).toBe(45);

    fireEvent.keyDown(svg, {key: 'ArrowLeft'});
    fireEvent.keyDown(svg, {key: 'ArrowLeft'});
    expect(azimuth()).toBe(25);
  });

  it('rotates pitch with ArrowUp/ArrowDown', () => {
    renderChart({interactive: true});
    const svg = screen.getByRole('img');

    fireEvent.keyDown(svg, {key: 'ArrowUp'});
    expect(elevation()).toBe(35);

    fireEvent.keyDown(svg, {key: 'ArrowDown'});
    fireEvent.keyDown(svg, {key: 'ArrowDown'});
    expect(elevation()).toBe(15);
  });

  it('clamps pitch to the same [-89, 89] range as pointer drag', () => {
    renderChart({interactive: true, elevation: 85});
    const svg = screen.getByRole('img');

    fireEvent.keyDown(svg, {key: 'ArrowUp'});
    expect(elevation()).toBe(89);
    fireEvent.keyDown(svg, {key: 'ArrowUp'});
    expect(elevation()).toBe(89);
  });

  it('clamps pitch at the lower bound', () => {
    renderChart({interactive: true, elevation: -85});
    const svg = screen.getByRole('img');

    fireEvent.keyDown(svg, {key: 'ArrowDown'});
    expect(elevation()).toBe(-89);
  });

  it('prevents default on arrow keys so the page does not scroll', () => {
    renderChart({interactive: true});
    const svg = screen.getByRole('img');

    // fireEvent returns false when preventDefault() was called.
    expect(fireEvent.keyDown(svg, {key: 'ArrowRight'})).toBe(false);
    expect(fireEvent.keyDown(svg, {key: 'ArrowUp'})).toBe(false);
    // Non-camera keys are left alone.
    expect(fireEvent.keyDown(svg, {key: 'Enter'})).toBe(true);
  });

  it('ignores arrow keys when not interactive', () => {
    renderChart({autoRotate: 1});
    const svg = screen.getByRole('img');

    expect(fireEvent.keyDown(svg, {key: 'ArrowRight'})).toBe(true);
    expect(azimuth()).toBe(35);
  });
});

describe('ThreeDChart container sizing', () => {
  it('renders no svg until the container reports a width', () => {
    render(
      <ThreeDChart data={data} xKey="x" yKey="y" zKey="z">
        <CameraProbe />
      </ThreeDChart>,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    reportWidth(600);

    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('width', '600');
    // Default height is 400.
    expect(svg).toHaveAttribute('height', '400');
  });

  it('sizes the svg from the height prop', () => {
    renderChart({height: 250});
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('width', '600');
    expect(svg).toHaveAttribute('height', '250');
  });
});

describe('use3D', () => {
  it('throws when used outside <ThreeDChart>', () => {
    function Probe() {
      use3D();
      return null;
    }

    expect(() => render(<Probe />)).toThrow(
      '3D components must be used inside <ThreeDChart>',
    );
  });
});
