// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MetricTile.test.tsx
 * @input Uses vitest, @testing-library/react, MetricTile
 * @output Unit tests for MetricTile — label/value, size, delta sentiment,
 *         description, and trend slot
 * @position Testing; validates MetricTile.tsx
 */

import {createRef} from 'react';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {MetricTile} from './MetricTile';

describe('MetricTile content', () => {
  it('renders label and value', () => {
    render(<MetricTile label="Total requests" value="2.4M" />);
    expect(screen.getByText('Total requests')).toBeInTheDocument();
    expect(screen.getByText('2.4M')).toBeInTheDocument();
  });

  it('renders the stable class and default size data attribute', () => {
    render(
      <MetricTile label="Total requests" value="2.4M" data-testid="tile" />,
    );
    const root = screen.getByTestId('tile');
    expect(root.classList.contains('astryx-metric-tile')).toBe(true);
    expect(root.getAttribute('data-size')).toBe('md');
  });

  it('reflects the size prop as a data attribute', () => {
    render(
      <MetricTile
        label="Total requests"
        value="2.4M"
        size="lg"
        data-testid="tile"
      />,
    );
    expect(screen.getByTestId('tile').getAttribute('data-size')).toBe('lg');
  });

  it('renders description text', () => {
    render(
      <MetricTile
        label="Total requests"
        value="2.4M"
        description="vs. previous 30 days"
      />,
    );
    expect(screen.getByText('vs. previous 30 days')).toBeInTheDocument();
  });

  it('renders the trend slot content', () => {
    render(
      <MetricTile
        label="Total requests"
        value="2.4M"
        trend={<div>trend</div>}
      />,
    );
    expect(screen.getByText('trend')).toBeInTheDocument();
  });

  it('forwards the ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<MetricTile label="Total requests" value="2.4M" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

describe('MetricTile delta', () => {
  it('renders delta text with screen-reader direction', () => {
    render(
      <MetricTile
        label="Total requests"
        value="2.4M"
        delta={{value: '+12.4%', direction: 'up'}}
      />,
    );
    expect(screen.getByText('+12.4%')).toBeInTheDocument();
    expect(screen.getByText('(trending up)')).toBeInTheDocument();
  });

  it('maps up direction to positive sentiment by default', () => {
    render(
      <MetricTile
        label="Signups"
        value="1,204"
        delta={{value: '+4.1%', direction: 'up'}}
      />,
    );
    expect(screen.getByText('+4.1%').getAttribute('data-sentiment')).toBe(
      'positive',
    );
  });

  it('maps down direction to negative sentiment by default', () => {
    render(
      <MetricTile
        label="Signups"
        value="1,204"
        delta={{value: '-4.1%', direction: 'down'}}
      />,
    );
    expect(screen.getByText('-4.1%').getAttribute('data-sentiment')).toBe(
      'negative',
    );
  });

  it('maps flat direction to neutral sentiment by default', () => {
    render(
      <MetricTile
        label="Active users"
        value="18,204"
        delta={{value: '0.0%', direction: 'flat'}}
      />,
    );
    expect(screen.getByText('0.0%').getAttribute('data-sentiment')).toBe(
      'neutral',
    );
    expect(screen.getByText('(flat)')).toBeInTheDocument();
  });

  it('lets sentiment override the direction mapping for inverted metrics', () => {
    render(
      <MetricTile
        label="P95 latency"
        value="284 ms"
        delta={{value: '-18 ms', direction: 'down', sentiment: 'positive'}}
      />,
    );
    expect(screen.getByText('-18 ms').getAttribute('data-sentiment')).toBe(
      'positive',
    );
  });
});
