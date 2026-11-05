// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {SVGIcon, type SVGIconDef} from './SVGIcon';
import {iconVars} from './tokens.stylex';
import {bellIcon, calendarIcon, homeIcon, xIcon} from './icons';

/** Top-level shape groups, excluding the <defs> mask block. */
function shapeGroups(svg: SVGSVGElement): Element[] {
  return Array.from(svg.children).filter(el => el.tagName === 'g');
}

describe('SVGIcon', () => {
  it('defaults to decorative (aria-hidden) when no accessible name is given', () => {
    const {container} = render(<SVGIcon icon={bellIcon} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
  });

  it('respects a consumer aria-label: role="img" and no aria-hidden', () => {
    render(<SVGIcon icon={bellIcon} aria-label="Notifications" />);
    const svg = screen.getByRole('img', {name: 'Notifications'});
    expect(svg).not.toHaveAttribute('aria-hidden');
  });

  it('respects a consumer aria-labelledby: role="img" and no aria-hidden', () => {
    render(
      <>
        <span id="svg-icon-lbl">Alerts</span>
        <SVGIcon icon={bellIcon} aria-labelledby="svg-icon-lbl" />
      </>,
    );
    const svg = screen.getByRole('img', {name: 'Alerts'});
    expect(svg).not.toHaveAttribute('aria-hidden');
  });

  it('still lets an explicit aria-hidden from the consumer win', () => {
    const {container} = render(
      <SVGIcon icon={bellIcon} aria-label="Notifications" aria-hidden="true" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders each shape with its attributes inside the default 24x24 viewBox', () => {
    const {container} = render(<SVGIcon icon={xIcon} />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');

    const lines = svg?.querySelectorAll('line') ?? [];
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveAttribute('x1', '18');
    expect(lines[0]).toHaveAttribute('y1', '6');
    expect(lines[0]).toHaveAttribute('x2', '6');
    expect(lines[0]).toHaveAttribute('y2', '18');
  });

  it('reflects variation, size, and color as data attributes with the stable class', () => {
    const {container, rerender} = render(<SVGIcon icon={xIcon} />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('astryx-svg-icon');
    // Defaults.
    expect(svg).toHaveAttribute('data-variation', 'linear');
    expect(svg).toHaveAttribute('data-size', 'md');
    expect(svg).toHaveAttribute('data-color', 'primary');

    rerender(
      <SVGIcon icon={xIcon} variation="twotone" size="sm" color="accent" />,
    );
    expect(svg).toHaveAttribute('data-variation', 'twotone');
    expect(svg).toHaveAttribute('data-size', 'sm');
    expect(svg).toHaveAttribute('data-color', 'accent');
  });

  it('splits fill-role and stroke-role shapes into separate layer groups', () => {
    const {container} = render(<SVGIcon icon={calendarIcon} />);
    const svg = container.querySelector('svg') as SVGSVGElement;

    // primary fill (frame rect), primary stroke (2 pegs),
    // secondary stroke (divider line) — no secondary fill group.
    const groups = shapeGroups(svg);
    expect(groups).toHaveLength(3);
    expect(groups[0].querySelectorAll('rect')).toHaveLength(1);
    expect(groups[0].querySelector('rect')).toHaveAttribute('width', '18');
    expect(groups[1].querySelectorAll('line')).toHaveLength(2);
    expect(groups[2].querySelectorAll('line')).toHaveLength(1);
    expect(groups[2].querySelector('line')).toHaveAttribute('y1', '10');
  });

  it('knocks secondary shapes out of the primary layer with a mask in bold mode', () => {
    const {container} = render(<SVGIcon icon={homeIcon} variation="bold" />);
    const svg = container.querySelector('svg') as SVGSVGElement;

    const mask = svg.querySelector('defs mask');
    expect(mask).not.toBeNull();

    // Mask = full white plate + the door as a black knockout.
    const plate = mask?.querySelector('rect');
    expect(plate).toHaveAttribute('width', '24');
    expect(plate).toHaveAttribute('height', '24');
    expect(plate).toHaveAttribute('fill', 'white');
    const knockout = mask?.querySelector('path');
    expect(knockout).toHaveAttribute('fill', 'black');
    expect(knockout).toHaveAttribute('stroke', 'black');
    expect(knockout).toHaveAttribute('stroke-linecap', 'round');

    // The primary fill layer references the mask; the secondary layer is
    // dropped entirely (it only exists as the knockout).
    const groups = shapeGroups(svg);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAttribute('mask', `url(#${mask?.id})`);
  });

  it('keeps the secondary layer visible without a mask outside bold mode', () => {
    const {container} = render(<SVGIcon icon={homeIcon} />);
    const svg = container.querySelector('svg') as SVGSVGElement;

    expect(svg.querySelector('mask')).toBeNull();
    const groups = shapeGroups(svg);
    expect(groups).toHaveLength(2);
    expect(groups[0]).not.toHaveAttribute('mask');
    // The door renders as a real secondary shape.
    expect(groups[1].querySelector('path')).toHaveAttribute(
      'd',
      'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
    );
  });

  it('skips the mask in bold mode when there is nothing to knock out', () => {
    // xIcon is stroke-role only — no fill shapes, no secondary layer.
    const {container} = render(<SVGIcon icon={xIcon} variation="bold" />);
    const svg = container.querySelector('svg') as SVGSVGElement;

    expect(svg.querySelector('mask')).toBeNull();
    expect(svg.querySelectorAll('line')).toHaveLength(2);
  });

  it('pins the stroke-width token inline when strokeWidth is set', () => {
    const strokeWidthProp = (iconVars['--icon-stroke-width'] as string).replace(
      /^var\((.+)\)$/,
      '$1',
    );

    const {container} = render(<SVGIcon icon={xIcon} strokeWidth={3} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.style.getPropertyValue(strokeWidthProp)).toBe('3');

    // Without the override the token stays with the size preset.
    const {container: plain} = render(<SVGIcon icon={xIcon} />);
    const plainSvg = plain.querySelector('svg') as SVGSVGElement;
    expect(plainSvg.style.getPropertyValue(strokeWidthProp)).toBe('');
  });

  it('honors a custom viewBox and passes extra svg props through', () => {
    const dotIcon: SVGIconDef = {
      name: 'Dot',
      viewBox: '0 0 32 32',
      primary: [{type: 'circle', attrs: {cx: '16', cy: '16', r: '8'}}],
    };
    const {container} = render(<SVGIcon icon={dotIcon} id="probe-icon" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 32 32');
    expect(svg).toHaveAttribute('id', 'probe-icon');
    // role defaults to "fill" — the circle lands in the fill-role group.
    expect(svg?.querySelector('g circle')).toHaveAttribute('r', '8');
  });
});
