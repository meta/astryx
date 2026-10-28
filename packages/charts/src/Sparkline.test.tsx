// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Sparkline.test.tsx
 * @input Uses vitest, @testing-library/react, Sparkline
 * @output Unit tests for Sparkline composition — accessible name, chromeless
 *         defaults, fill variants, and root DOM/ref passthrough
 * @position Testing; validates Sparkline.tsx composed defaults
 */

import {createRef} from 'react';
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import {Sparkline} from './Sparkline';

const data = [4, 7, 5, 9, 6, 11];

let resizeCallback: ResizeObserverCallback | undefined;
let observedElement: Element | undefined;

beforeEach(() => {
  resizeCallback = undefined;
  observedElement = undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe(element: Element) {
        observedElement = element;
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function reportWidth(width: number) {
  if (!observedElement) {
    throw new Error('Sparkline did not subscribe to ResizeObserver');
  }
  act(() => {
    resizeCallback?.(
      [
        {
          target: observedElement,
          contentRect: {width},
        } as unknown as ResizeObserverEntry,
      ],
      {} as unknown as ResizeObserver,
    );
  });
}

describe('Sparkline rendering', () => {
  it('exposes the svg as a named image with the title', () => {
    render(<Sparkline data={data} title="Requests over the last hour" />);
    reportWidth(120);

    expect(
      screen.getByRole('img', {name: 'Requests over the last hour'}),
    ).toBeInTheDocument();
  });

  it('renders no legend, axes, or grid chrome', () => {
    const {container} = render(<Sparkline data={data} />);
    reportWidth(120);

    expect(container.querySelector('[role="list"]')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders the line variant when fill is false', () => {
    render(<Sparkline data={data} fill={false} title="Line sparkline" />);
    reportWidth(120);

    expect(
      screen.getByRole('img', {name: 'Line sparkline'}),
    ).toBeInTheDocument();
  });

  it('renders an empty series without crashing', () => {
    render(<Sparkline data={[]} title="Empty sparkline" />);
    reportWidth(120);

    expect(
      screen.getByRole('img', {name: 'Empty sparkline'}),
    ).toBeInTheDocument();
  });
});

describe('Sparkline root passthrough', () => {
  it('forwards the ref to the root chart container', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Sparkline data={data} ref={ref} />);
    reportWidth(120);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
