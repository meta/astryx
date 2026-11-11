// Copyright (c) Meta Platforms, Inc. and affiliates.

import {StrictMode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {createPortal} from 'react-dom';
import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {
  WeightedSVGIcon,
  WeightedIconSprite,
  weightedIconSymbolId,
} from './WeightedSVGIcon';
import {buildWeightedIcon, parseSVGPaths} from './buildWeightedIcon';
import {iconColorStyles} from './colors.stylex';
import {SVGIcon} from './SVGIcon';
import {checkIcon} from './icons';
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

describe('the weight probe font', () => {
  /** Gives a document's window a FontFace and its document a font set. */
  function stubFonts(doc: Document) {
    const faces = new Set<{family: string}>();
    const add = vi.fn((face: {family: string}) => faces.add(face));
    const view = doc.defaultView as Window & {FontFace?: unknown};
    view.FontFace = class {
      family: string;
      constructor(family: string) {
        this.family = family;
      }
      load() {
        return Promise.resolve(this);
      }
    };
    Object.defineProperty(doc, 'fonts', {
      configurable: true,
      value: {add, [Symbol.iterator]: () => faces.values()},
    });
    return add;
  }

  it('is added once per document by every copy of the module, a swizzled one too', async () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const frameDoc = iframe.contentDocument;
    if (frameDoc == null) {
      throw new Error('no iframe document');
    }
    const add = stubFonts(frameDoc);
    const first = await import('./weightProbe');
    vi.resetModules();
    const second = await import('./weightProbe');
    expect(second).not.toBe(first);

    first.registerWeightProbe(frameDoc);
    second.registerWeightProbe(frameDoc);

    expect(add).toHaveBeenCalledTimes(1);
    iframe.remove();
  });

  it('is added once per document, in StrictMode too, including an iframe the icon renders into', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const frameDoc = iframe.contentDocument;
    if (frameDoc == null) {
      throw new Error('no iframe document');
    }
    const addToFrame = stubFonts(frameDoc);
    const {unmount} = render(
      <StrictMode>
        {createPortal(
          <>
            <WeightedSVGIcon icon={bellWeightedIcon} />
            <WeightedSVGIcon icon={bellWeightedIcon} />
          </>,
          frameDoc.body,
        )}
      </StrictMode>,
    );
    expect(addToFrame).toHaveBeenCalledTimes(1);
    unmount();
    iframe.remove();
  });

  it('paints each color with the same icon role as SVGIcon', () => {
    for (const color of ['positive', 'negative', 'warning'] as const) {
      const roleClasses = (
        stylex.props(iconColorStyles[color]).className ?? ''
      ).split(' ');
      const {container, unmount} = render(
        <>
          <WeightedSVGIcon icon={bellWeightedIcon} color={color} />
          <SVGIcon icon={checkIcon} color={color} />
        </>,
      );
      for (const root of container.querySelectorAll(
        '.astryx-weighted-svg-icon, .astryx-svg-icon',
      )) {
        expect(root).toHaveClass(...roleClasses);
      }
      unmount();
    }
  });

  it('keeps a caller className beside its own classes', () => {
    const {container} = render(
      <WeightedSVGIcon icon={bellWeightedIcon} className="caller" />,
    );
    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('caller');
    expect(icon?.classList.length).toBeGreaterThan(1);
  });
});
