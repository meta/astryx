// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {
  WeightedSVGIcon,
  WeightedIconSprite,
  weightedIconSymbolId,
} from './WeightedSVGIcon';
import {buildWeightedIcon, parseSVGPaths} from './buildWeightedIcon';
import {bellWeightedIcon, weightedStarterIcons} from './weightedIcons';

const svg = (d: string) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

describe('buildWeightedIcon', () => {
  it('merges identical drawings at neighboring weights into one layer', () => {
    const icon = buildWeightedIcon('dot', {
      300: svg('M1 1'),
      400: svg('M1 1'),
      500: svg('M2 2'),
      600: svg('M3 3'),
      700: svg('M3 3'),
    });
    expect(icon.layers.map(l => [l.from, l.to])).toEqual([
      [300, 400],
      [500, 500],
      [600, 700],
    ]);
  });

  it('covers every weight with the nearest kept drawing when weights are pruned', () => {
    const icon = buildWeightedIcon(
      'dot',
      {
        300: svg('A'),
        400: svg('B'),
        500: svg('C'),
        600: svg('D'),
        700: svg('E'),
      },
      {weights: [400, 600]},
    );
    // 300 -> 400 (nearest), 500 -> 600 (tie goes heavier), 700 -> 600.
    expect(icon.layers.map(l => [l.from, l.to, l.paths[0].d])).toEqual([
      [300, 400, 'B'],
      [500, 700, 'D'],
    ]);
  });

  it('keeps the even-odd fill rule', () => {
    expect(
      parseSVGPaths('<svg><path fill-rule="evenodd" d="M0 0"/></svg>'),
    ).toEqual([{d: 'M0 0', evenOdd: true}]);
  });

  it('demo icons cover all five weights without gaps', () => {
    for (const icon of weightedStarterIcons) {
      const covered = icon.layers.flatMap(l => {
        const ws = [];
        for (let w = l.from; w <= l.to; w += 100) {
          ws.push(w);
        }
        return ws;
      });
      expect(covered).toEqual([300, 400, 500, 600, 700]);
    }
  });
});

describe('WeightedSVGIcon', () => {
  it('draws one group per distinct drawing, inline', () => {
    const {container} = render(<WeightedSVGIcon icon={bellWeightedIcon} />);
    const groups = container.querySelectorAll('svg > g');
    expect(groups).toHaveLength(bellWeightedIcon.layers.length);
  });

  it('references the sprite symbol in sprite mode', () => {
    const {container} = render(
      <>
        <WeightedIconSprite icons={[bellWeightedIcon]} />
        <WeightedSVGIcon icon={bellWeightedIcon} sprite />
      </>,
    );
    const id = weightedIconSymbolId(bellWeightedIcon);
    expect(container.querySelector(`symbol#${id}`)).not.toBeNull();
    expect(container.querySelector('use')).toHaveAttribute('href', `#${id}`);
  });

  it('pins the weight through the override property', () => {
    const {container} = render(
      <WeightedSVGIcon icon={bellWeightedIcon} weight={700} />,
    );
    expect(
      container
        .querySelector('svg')
        ?.style.getPropertyValue('--astryx-icon-weight'),
    ).toBe('700');
  });

  it('is decorative by default and named when labeled', () => {
    const {container} = render(<WeightedSVGIcon icon={bellWeightedIcon} />);
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    render(<WeightedSVGIcon icon={bellWeightedIcon} aria-label="Alerts" />);
    expect(screen.getByRole('img', {name: 'Alerts'})).toBeInTheDocument();
  });
});
