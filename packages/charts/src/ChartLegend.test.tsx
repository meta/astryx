// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartLegend.test.tsx
 * @input Uses vitest, @testing-library/react, ChartLegend
 * @output Functional tests for chart legend semantics, localization, and layout
 * @position Colocated test for ChartLegend.tsx (issue #4295 viz coverage)
 */

import {describe, it, expect} from 'vitest';
import {render, screen, within} from '@testing-library/react';
import {ChartLegend} from './ChartLegend';
import {InternationalizationProvider} from '@astryxdesign/core';

const items = [
  {label: 'Revenue', color: '#ff0000', type: 'bar'},
  {label: 'Profit', color: '#00ff00', type: 'line'},
];

describe('ChartLegend', () => {
  it('exposes list semantics with one item per legend entry', () => {
    render(<ChartLegend items={items} />);
    const list = screen.getByRole('list', {name: 'Chart legend'});
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Revenue')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Profit')).toBeInTheDocument();
  });

  it('localizes the list label', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        messages={{
          fr: {
            '@astryx.chartLegend.label': {
              defaultMessage: 'Légende du graphique',
            },
          },
        }}>
        <ChartLegend items={items} />
      </InternationalizationProvider>,
    );

    expect(
      screen.getByRole('list', {name: 'Légende du graphique'}),
    ).toBeInTheDocument();
  });

  it('renders a decorative swatch in each entry with the item color', () => {
    render(<ChartLegend items={items} />);
    const rows = screen.getAllByRole('listitem');
    const firstSwatch = rows[0].querySelector('[aria-hidden="true"]');
    const secondSwatch = rows[1].querySelector('[aria-hidden="true"]');
    expect(firstSwatch).not.toBeNull();
    expect(firstSwatch!.getAttribute('style')).toContain('#ff0000');
    expect(secondSwatch!.getAttribute('style')).toContain('#00ff00');
  });

  it('renders nothing when there are no items', () => {
    const {container} = render(<ChartLegend items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when items are omitted entirely', () => {
    const {container} = render(<ChartLegend />);
    expect(container.firstChild).toBeNull();
  });

  it('keeps list semantics in the vertical (start/end) orientation', () => {
    render(<ChartLegend items={items} position="end" />);
    const list = screen.getByRole('list', {name: 'Chart legend'});
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  });
});
