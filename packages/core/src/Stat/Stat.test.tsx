// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {InternationalizationProvider} from '../i18n';
import {Stat, type StatDelta} from './Stat';

describe('Stat', () => {
  it('renders label and value', () => {
    render(<Stat label="Total requests" value="2.4M" />);
    expect(screen.getByText('Total requests')).toBeInTheDocument();
    expect(screen.getByText('2.4M')).toBeInTheDocument();
  });

  it('renders the stable class and default size data attribute', () => {
    render(<Stat label="Total requests" value="2.4M" data-testid="stat" />);
    const root = screen.getByTestId('stat');
    expect(root.classList.contains('astryx-stat')).toBe(true);
    expect(root.getAttribute('data-size')).toBe('md');
  });

  it('reflects the size prop as a data attribute', () => {
    render(
      <Stat label="Total requests" value="2.4M" size="lg" data-testid="stat" />,
    );
    expect(screen.getByTestId('stat').getAttribute('data-size')).toBe('lg');
  });

  it('renders delta text with screen-reader direction', () => {
    render(
      <Stat
        label="Total requests"
        value="2.4M"
        delta={{value: '+12.4%', direction: 'up'}}
      />,
    );
    expect(screen.getByText('+12.4%')).toBeInTheDocument();
    expect(screen.getByText('(trending up)')).toBeInTheDocument();
  });

  /** The delta element of a Stat rendered with `delta`. */
  function deltaOf(delta: StatDelta): HTMLElement {
    const {unmount} = render(<Stat label="Metric" value="1" delta={delta} />);
    const element = screen.getByText(delta.value);
    const copy = element.cloneNode(true) as HTMLElement;
    unmount();
    return copy;
  }

  /** The text color of the delta of a Stat rendered with `delta`. */
  function deltaColor(delta: StatDelta): string {
    const {unmount} = render(<Stat label="Metric" value="1" delta={delta} />);
    const color = getComputedStyle(screen.getByText(delta.value)).color;
    unmount();
    return color;
  }

  it.each([
    ['success', '--color-text-success'],
    ['error', '--color-text-error'],
    ['neutral', '--color-text-secondary'],
  ] as const)('colors a %s tone with %s', (sentiment, token) => {
    expect(deltaColor({value: '1%', direction: 'flat', sentiment})).toContain(
      token,
    );
  });

  it.each([
    ['up', '--color-text-success'],
    ['down', '--color-text-error'],
    ['flat', '--color-text-secondary'],
  ] as const)('gives %s its default tone, %s', (direction, token) => {
    expect(deltaColor({value: '1%', direction})).toContain(token);
  });

  it('reads a flat change as flat', () => {
    render(
      <Stat
        label="Active users"
        value="18,204"
        delta={{value: '0.0%', direction: 'flat'}}
      />,
    );
    expect(screen.getByText('(flat)')).toBeInTheDocument();
  });

  it('lets sentiment override the direction tone for inverted metrics', () => {
    const inverted: StatDelta = {
      value: '-0.08%',
      direction: 'down',
      sentiment: 'success',
    };
    expect(deltaColor(inverted)).toContain('--color-text-success');
    expect(deltaOf(inverted).textContent).toContain('(trending down)');
  });

  it('adds no attribute for the tone', () => {
    const delta = deltaOf({value: '+1%', direction: 'up'});
    expect(
      delta.getAttributeNames().filter(name => name.startsWith('data-')),
    ).toEqual([]);
  });

  it('renders the description when provided', () => {
    render(
      <Stat
        label="Total requests"
        value="2.4M"
        description="vs. previous 30 days"
      />,
    );
    expect(screen.getByText('vs. previous 30 days')).toBeInTheDocument();
  });

  it('renders media content when provided', () => {
    render(
      <Stat
        label="Total requests"
        value="2.4M"
        media={<svg data-testid="sparkline" />}
      />,
    );
    expect(screen.getByTestId('sparkline')).toBeInTheDocument();
  });

  it('renders no description line for an empty description', () => {
    render(
      <Stat
        label="Total requests"
        value="2.4M"
        description=""
        data-testid="stat"
      />,
    );
    expect(screen.getByTestId('stat').children).toHaveLength(2);
  });

  it.each([
    ['false', false],
    ['true', true],
    ['an empty string', ''],
    ['null', null],
  ])('renders no media wrapper for %s media', (_, media) => {
    render(
      <Stat
        label="Total requests"
        value="2.4M"
        data-testid="stat"
        media={media}
      />,
    );
    const root = screen.getByTestId('stat');
    // Label and value row only: no third or fourth child for the media slot.
    expect(root.children).toHaveLength(2);
  });

  it('does not render a delta glyph without a delta', () => {
    const {container} = render(<Stat label="Total requests" value="2.4M" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('forwards ref', () => {
    const ref = {current: null as HTMLDivElement | null};
    render(<Stat ref={ref} label="Total requests" value="2.4M" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('supports data-testid', () => {
    render(<Stat label="Total requests" value="2.4M" data-testid="stat" />);
    expect(screen.getByTestId('stat')).toBeInTheDocument();
  });

  it('accepts a ReactNode value', () => {
    render(
      <Stat
        label="Uptime"
        value={
          <span>
            99.98<small>%</small>
          </span>
        }
      />,
    );
    expect(screen.getByText('99.98')).toBeInTheDocument();
  });

  it('takes its screen-reader trend text from the translation catalog', () => {
    render(
      <InternationalizationProvider
        locale="en"
        overrides={{
          en: {
            '@astryx.stat.delta.up': '(rising)',
            '@astryx.stat.delta.down': '(falling)',
            '@astryx.stat.delta.flat': '(steady)',
          },
        }}>
        <Stat label="A" value="1" delta={{value: '+1', direction: 'up'}} />
        <Stat label="B" value="2" delta={{value: '-1', direction: 'down'}} />
        <Stat label="C" value="3" delta={{value: '0', direction: 'flat'}} />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('(rising)')).toBeInTheDocument();
    expect(screen.getByText('(falling)')).toBeInTheDocument();
    expect(screen.getByText('(steady)')).toBeInTheDocument();
  });
});
